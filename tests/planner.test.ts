import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Planner } from '../server/planner.js';
import { Store } from '../server/store.js';

const modelResponse = (result: unknown) =>
  new Response(
    JSON.stringify({
      status: 'completed',
      model: 'actual-provider-model',
      output: [
        { type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ result }) }] },
      ],
    }),
    { status: 200 },
  );
test('real planner adapter sends bounded schema and persists validated provenance without reserving', async (t) => {
  const store = new Store(':memory:');
  const stub = t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(String(init.body));
    assert.equal(body.model, 'configured-model');
    assert.equal(body.store, false);
    assert.equal(body.text.format.strict, true);
    assert.equal(body.max_output_tokens, 1200);
    assert.ok(body.instructions.includes('Never approve payment'));
    assert.equal(JSON.parse(body.input).catalog.length, 14);
    return modelResponse({
      kind: 'basket',
      summary: 'Six refillable pen sets for new starters.',
      items: [{ sku: 'PEN-01', quantity: 6 }],
    });
  });
  try {
    const p = await new Planner(store, 'test-only-model-key', 'configured-model').plan(
      'Six reusable pen sets under $80',
      'studio-agent',
    );
    assert.equal(p.model, 'actual-provider-model');
    assert.equal(p.output.kind, 'basket');
    assert.ok(store.db.prepare('SELECT id FROM plans WHERE id=?').get(p.id));
    assert.equal(store.budget().reservedCents, 0);
    assert.equal(stub.mock.callCount(), 1);
  } finally {
    store.close();
  }
});
test('planner accepts clarification without inventing a basket', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    modelResponse({ kind: 'clarification', question: 'How many people and what budget?' }),
  );
  const store = new Store(':memory:');
  try {
    const p = await new Planner(store, 'test-key', 'model').plan('Something nice', 'studio-agent');
    assert.equal(p.output.kind, 'clarification');
    assert.equal(store.list().length, 0);
  } finally {
    store.close();
  }
});
test('planner rejects unknown SKUs, extra authority, invalid quantities and merged excess', async (t) => {
  const store = new Store(':memory:');
  const planner = new Planner(store, 'test-key', 'model');
  let output: unknown;
  t.mock.method(globalThis, 'fetch', async () => modelResponse(output));
  try {
    for (const value of [
      { kind: 'basket', summary: 'Unknown', items: [{ sku: 'INVENTED', quantity: 1 }] },
      {
        kind: 'basket',
        summary: 'Extra authority',
        items: [{ sku: 'PEN-01', quantity: 1 }],
        approved: true,
      },
      { kind: 'basket', summary: 'Fractional', items: [{ sku: 'PEN-01', quantity: 1.5 }] },
      {
        kind: 'basket',
        summary: 'Too many merged',
        items: [
          { sku: 'PEN-01', quantity: 11 },
          { sku: 'PEN-01', quantity: 10 },
        ],
      },
    ]) {
      output = value;
      await assert.rejects(planner.plan('Supplies', 'studio-agent'));
    }
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM plans').get()!.n, 0);
    assert.equal(store.list().length, 0);
  } finally {
    store.close();
  }
});
test('planner retries transient failure once before any purchase action', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    if (calls === 1) throw new Error('Simulated timeout');
    return modelResponse({
      kind: 'basket',
      summary: 'Coffee',
      items: [{ sku: 'COFFEE-01', quantity: 1 }],
    });
  });
  const store = new Store(':memory:');
  try {
    await new Planner(store, 'test-key', 'model').plan('Coffee restock', 'studio-agent');
    assert.equal(calls, 2);
    assert.equal(store.list().length, 0);
  } finally {
    store.close();
  }
});
test('planner reports failure and refusal honestly; no placeholder result or reservation', async (t) => {
  const store = new Store(':memory:');
  let response = new Response('', { status: 503 });
  const stub = t.mock.method(globalThis, 'fetch', async () => response.clone());
  const planner = new Planner(store, 'test-key', 'model');
  try {
    await assert.rejects(planner.plan('Coffee restock', 'studio-agent'), /failed/);
    assert.equal(stub.mock.callCount(), 2);
    response = new Response(
      JSON.stringify({
        status: 'completed',
        output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'Cannot assist' }] }],
      }),
    );
    await assert.rejects(planner.plan('Coffee restock', 'studio-agent'), /invalid plan/);
    assert.equal(store.budget().reservedCents, 0);
  } finally {
    store.close();
  }
});
test('manual changes cannot retain model provenance', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    modelResponse({
      kind: 'basket',
      summary: 'Coffee',
      items: [{ sku: 'COFFEE-01', quantity: 1 }],
    }),
  );
  const { fixture } = await import('./fixtures.js');
  const { service, store } = fixture();
  try {
    const plan = await new Planner(store, 'test-key', 'model').plan(
      'Coffee restock',
      'studio-agent',
    );
    const body = {
      title: 'Coffee',
      currency: 'USD',
      planId: plan.id,
      items: [{ sku: 'COFFEE-01', quantity: 2 }],
    };
    assert.throws(() => service.submit(body, 'modified-model-plan', 'studio-agent'), /differs/);
    const p = service.submit(
      { ...body, items: [{ sku: 'COFFEE-01', quantity: 1 }] },
      'original-model-plan',
      'studio-agent',
    );
    assert.equal(p.source, 'model');
  } finally {
    store.close();
  }
});
