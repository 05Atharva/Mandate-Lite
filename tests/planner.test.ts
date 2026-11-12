import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Planner } from '../server/planner.js';
import { Store } from '../server/store.js';
import { modelConfig } from '../server/model-config.js';

const modelResponse = (result: unknown) =>
  new Response(
    JSON.stringify({
      status: 'completed',
      model: 'actual-provider-model',
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: JSON.stringify({
                result:
                  typeof result === 'object' &&
                  result !== null &&
                  'kind' in result &&
                  result.kind === 'basket'
                    ? {
                        preferenceEvidence: ['Selection matches the requested catalog items.'],
                        ...result,
                      }
                    : result,
              }),
            },
          ],
        },
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
      userSummary: 'Six refillable pen sets for new starters.',
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
      { kind: 'basket', userSummary: 'Unknown', items: [{ sku: 'INVENTED', quantity: 1 }] },
      {
        kind: 'basket',
        userSummary: 'Extra authority',
        items: [{ sku: 'PEN-01', quantity: 1 }],
        approved: true,
      },
      { kind: 'basket', userSummary: 'Fractional', items: [{ sku: 'PEN-01', quantity: 1.5 }] },
      {
        kind: 'basket',
        userSummary: 'Too many merged',
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
      userSummary: 'Coffee',
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
      userSummary: 'Coffee',
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

test('Groq uses its own endpoint/key, persists actual provenance, and excludes reasoning traces', async (t) => {
  const store = new Store(':memory:');
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://api.groq.com/openai/v1/responses');
    assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer groq-test-key');
    const body = JSON.parse(String(init.body));
    assert.equal(body.model, 'openai/gpt-oss-20b');
    assert.equal(body.text.format.strict, true);
    assert.equal(body.max_output_tokens, 2048);
    const response = await modelResponse({
      kind: 'basket',
      userSummary: 'Coffee restock',
      items: [{ sku: 'COFFEE-01', quantity: 1 }],
    }).json();
    response.output.unshift({
      type: 'reasoning',
      content: [{ type: 'reasoning_text', text: 'PRIVATE-TRACE-MUST-NOT-PERSIST' }],
    });
    return new Response(JSON.stringify(response));
  });
  try {
    const plan = await new Planner(store, 'groq-test-key', 'openai/gpt-oss-20b', 'groq').plan(
      'One coffee restock',
      'studio-agent',
    );
    assert.equal(plan.provider, 'Groq');
    assert.equal(plan.model, 'actual-provider-model');
    assert.equal(plan.templateVersion, 'catalog-planner-v3');
    assert.ok(!JSON.stringify(store.events()).includes('PRIVATE-TRACE'));
    assert.ok(
      !String(store.db.prepare('SELECT data FROM plans').get()!.data).includes('groq-test-key'),
    );
  } finally {
    store.close();
  }
});

test('clarification answers retain the original need and are scoped to the authenticated agent', async (t) => {
  const store = new Store(':memory:');
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    calls++;
    const input = JSON.parse(JSON.parse(String(init.body)).input);
    if (calls === 1)
      return modelResponse({ kind: 'clarification', question: 'How many new starters?' });
    assert.equal(input.need, '6');
    assert.deepEqual(input.clarificationContext, [
      { need: 'Reusable pens for new starters under $80', question: 'How many new starters?' },
    ]);
    return modelResponse({
      kind: 'basket',
      userSummary: 'Six pen sets',
      preferenceEvidence: ['Six reusable pen sets cost $42, below $80.'],
      items: [
        { sku: 'PEN-01', quantity: 2 },
        { sku: 'PEN-01', quantity: 4 },
      ],
    });
  });
  try {
    const planner = new Planner(store, 'test-key', 'model');
    const first = await planner.plan('Reusable pens for new starters under $80', 'studio-agent');
    await assert.rejects(planner.plan('6', 'other-agent', first.id), /not found/);
    const next = await planner.plan('6', 'studio-agent', first.id);
    assert.equal(next.previousPlanId, first.id);
    assert.equal(next.context.length, 1);
    assert.equal(next.output.kind, 'basket');
    if (next.output.kind === 'basket')
      assert.deepEqual(next.output.items, [{ sku: 'PEN-01', quantity: 6 }]);
    await assert.rejects(
      planner.plan('Change it', 'studio-agent', next.id),
      /Only a clarification/,
    );
  } finally {
    store.close();
  }
});

test('provider configuration never sends one provider key to another endpoint', () => {
  assert.deepEqual(
    modelConfig({
      LLM_PROVIDER: 'groq',
      GROQ_API_KEY: 'groq-secret',
      OPENAI_API_KEY: 'openai-secret',
    }),
    { provider: 'groq', apiKey: 'groq-secret', model: 'openai/gpt-oss-20b' },
  );
  assert.equal(modelConfig({ LLM_PROVIDER: 'groq', OPENAI_API_KEY: 'openai-secret' }).apiKey, '');
  assert.equal(
    modelConfig({ OPENAI_API_KEY: 'openai-secret', GROQ_API_KEY: 'groq-secret' }).apiKey,
    'openai-secret',
  );
  assert.equal(
    modelConfig({ LLM_PROVIDER: 'groq', LLM_MODEL: 'chosen-model' }).model,
    'chosen-model',
  );
  assert.throws(() => modelConfig({ LLM_PROVIDER: 'unrecognized' }), /must be openai or groq/);
});
