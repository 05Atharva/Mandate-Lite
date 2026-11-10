import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { Store } from '../server/store.js';
import { FakePayPal, defaultMandate } from './fixtures.js';
import type { AddressInfo } from 'node:net';
import type { Purchase } from '../shared/types.js';

test('HTTP enforces session, CSRF, owner/agent separation and saved-order binding', async () => {
  const store = new Store(':memory:'); const provider = new FakePayPal();
  const config = { appUrl: '', ownerPassword: 'owner-test-password', agentKey: 'agent-test-key', secureCookie: false, openaiKey: '', model: 'gpt-4.1-mini' };
  const { app, errors } = createApp(store, provider, config); app.use(errors);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  config.appUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = (path: string, body?: unknown, headers: Record<string, string> = {}, method = body === undefined ? 'GET' : 'POST') => fetch(config.appUrl + '/api' + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const agent = { Authorization: 'Bearer agent-test-key' };
  try {
    assert.equal((await call('/dashboard')).status, 401); assert.equal((await call('/session', { password: 'owner-test-password' })).status, 403);
    assert.equal((await call('/mandate', defaultMandate(), agent)).status, 403);
    const login = await call('/session', { password: 'owner-test-password' }, { Origin: config.appUrl }); assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie')!.split(';')[0]; const { csrfToken } = await login.json() as { csrfToken: string };
    const owner = { Cookie: cookie, Origin: config.appUrl, 'X-CSRF-Token': csrfToken };
    assert.equal((await call('/mandate', defaultMandate(), { Cookie: cookie, Origin: config.appUrl })).status, 403);
    assert.equal((await call('/mandate', defaultMandate(), { ...owner, Origin: 'https://attacker.example' })).status, 403);
    assert.equal((await call('/mandate', defaultMandate(), owner)).status, 201);
    assert.equal((await call('/session', undefined, { Cookie: cookie })).status, 200);
    // Opening another tab must not invalidate the original tab's CSRF token.
    assert.equal((await call('/dashboard', undefined, owner)).status, 200);
    const created = await call('/intents', { title: 'Gift', currency: 'USD', items: [{ sku: 'GIFT-01', quantity: 1 }] }, { ...agent, 'Idempotency-Key': 'http-gift-key' }); assert.equal(created.status, 201);
    const p = await created.json() as Purchase;
    for (const path of ['decision', 'checkout', 'capture', 'reconcile', 'cancel']) assert.equal((await call(`/intents/${p.id}/${path}`, {}, agent)).status, 403);
    assert.equal((await call('/dashboard', undefined, agent)).status, 403); assert.equal((await call('/audit', undefined, agent)).status, 403);
    assert.equal((await call(`/intents/${p.id}/decision`, { decision: 'approve', basketHash: p.basketHash }, owner)).status, 200);
    const checkout = await call(`/intents/${p.id}/checkout`, {}, owner); const ready = await checkout.json() as Purchase; provider.approve(ready.orderId!);
    assert.equal((await call(`/intents/${p.id}/capture`, { orderId: 'TAMPERED' }, owner)).status, 409); assert.equal(provider.captureCalls.length, 0);
    assert.equal((await call(`/intents/${p.id}/capture`, { orderId: ready.orderId }, owner)).status, 200);
    const audit = await (await call('/audit', undefined, owner)).text(); assert.ok(!audit.includes(config.ownerPassword)); assert.ok(!audit.includes(config.agentKey)); assert.ok(!audit.includes(csrfToken));
    assert.equal((await call('/not-a-route', undefined, owner)).status, 404);
    assert.equal((await call('/plans', { need: 'Six new starters' }, agent)).status, 503);
    assert.equal((await call('/session', undefined, owner, 'DELETE')).status, 200); assert.equal((await call('/dashboard', undefined, owner)).status, 401);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); store.close(); }
});
