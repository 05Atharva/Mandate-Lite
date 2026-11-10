import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PayPal } from '../server/paypal.js';
import { fixture, submit } from './fixtures.js';

test('PayPal adapter uses sandbox OAuth, frozen create payload and distinct stable operation IDs', async (t) => {
  const { service, store } = fixture();
  const p = submit(service);
  let tokenCalls = 0;
  const calls: { path: string; headers: Headers; body: unknown }[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.ok(url.startsWith('https://api-m.sandbox.paypal.com/'));
    if (url.endsWith('/v1/oauth2/token')) {
      tokenCalls++;
      assert.equal(options.body, 'grant_type=client_credentials');
      return new Response(JSON.stringify({ access_token: 'test-token', expires_in: 3600 }));
    }
    calls.push({
      path: url,
      headers: new Headers(options.headers),
      body: options.body ? JSON.parse(String(options.body)) : undefined,
    });
    return new Response(
      JSON.stringify({ id: 'PROVIDER-ORDER', status: 'CREATED', purchase_units: [] }),
    );
  });
  try {
    const adapter = new PayPal(
      'test-client',
      'test-secret',
      'TEST-MERCHANT',
      'http://localhost:3000',
    );
    await adapter.create(p, 'stable-create-operation');
    await adapter.read('PROVIDER-ORDER');
    await adapter.capture('PROVIDER-ORDER', 'stable-capture-operation');
    assert.equal(tokenCalls, 1);
    assert.equal(calls[0].headers.get('PayPal-Request-Id'), 'stable-create-operation');
    assert.equal(calls[2].headers.get('PayPal-Request-Id'), 'stable-capture-operation');
    const body = calls[0].body as {
      intent: string;
      purchase_units: {
        custom_id: string;
        amount: { value: string; currency_code: string };
        payee: { merchant_id: string };
      }[];
      payment_source: {
        paypal: { experience_context: { return_url: string; cancel_url: string } };
      };
    };
    assert.equal(body.intent, 'CAPTURE');
    assert.equal(body.purchase_units[0].amount.value, '18.00');
    assert.equal(body.purchase_units[0].amount.currency_code, 'USD');
    assert.equal(body.purchase_units[0].custom_id, p.id);
    assert.equal(body.purchase_units[0].payee.merchant_id, 'TEST-MERCHANT');
    assert.ok(body.payment_source.paypal.experience_context.return_url.includes(p.id));
    assert.ok(body.payment_source.paypal.experience_context.cancel_url.includes(p.id));
  } finally {
    store.close();
  }
});
test('missing merchant configuration and provider authentication failures cannot report success', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response(JSON.stringify({ access_token: 'should-not-leak' }), { status: 401 }),
  );
  const { service, store } = fixture();
  try {
    const p = submit(service);
    await assert.rejects(
      new PayPal('id', 'secret', '', 'http://localhost:3000').create(p, 'key'),
      /Configure/,
    );
    await assert.rejects(
      new PayPal('id', 'secret', 'merchant', 'http://localhost:3000').create(p, 'key'),
      /authentication failed/,
    );
  } finally {
    store.close();
  }
});
