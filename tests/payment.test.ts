import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixture, submit, FakePayPal } from './fixtures.js';
import { Store } from '../server/store.js';
import { PurchasingService } from '../server/service.js';
import { approvalUrl, cents } from '../server/paypal.js';

test('checkout and capture are each claimed once, including parallel clicks', async () => {
  const { service, store, provider } = fixture();
  const p = submit(service);
  const [a] = await Promise.all([service.checkout(p.id), service.checkout(p.id)]);
  assert.equal(provider.createCalls.length, 1);
  assert.equal(a.state, 'CHECKOUT');
  provider.approve(a.orderId!);
  await Promise.all([service.capture(p.id, a.orderId!), service.capture(p.id, a.orderId!)]);
  assert.equal(provider.captureCalls.length, 1);
  assert.notEqual(provider.createCalls[0], provider.captureCalls[0]);
  assert.equal(store.get(p.id)?.state, 'CAPTURED');
  assert.deepEqual(store.budget(), { spentCents: 1800, reservedCents: 0, availableCents: 38200 });
  await service.reconcile(p.id);
  await service.capture(p.id, a.orderId!);
  assert.equal(store.budget().spentCents, 1800);
  assert.equal(store.events().filter((e) => e.type === 'PAYMENT_COMPLETED').length, 1);
  store.close();
});
test('review and blocked purchases cannot create orders', async () => {
  const { service, store, provider } = fixture();
  const gift = submit(service, 'GIFT-01');
  const blocked = submit(service, 'ESPRESSO-01');
  await assert.rejects(service.checkout(gift.id));
  await assert.rejects(service.checkout(blocked.id));
  assert.equal(provider.createCalls.length, 0);
  service.decide(gift.id, 'approve', gift.basketHash);
  assert.equal((await service.checkout(gift.id)).state, 'CHECKOUT');
  store.close();
});
test('buyer consent, callback order, payee, amount and USD must match before capture', async () => {
  for (const mutation of [
    'consent',
    'order',
    'payee',
    'amount',
    'currency',
    'reference',
    'custom',
  ] as const) {
    const { service, store, provider } = fixture();
    const p = await service.checkout(submit(service).id);
    const order = provider.orders.get(p.orderId!)!;
    provider.approve(p.orderId!);
    if (mutation === 'consent') order.status = 'CREATED';
    if (mutation === 'payee') order.purchase_units[0].payee!.merchant_id = 'ATTACKER';
    if (mutation === 'amount') order.purchase_units[0].amount.value = '0.01';
    if (mutation === 'currency') order.purchase_units[0].amount.currency_code = 'EUR';
    if (mutation === 'reference') order.purchase_units[0].reference_id = 'other-request';
    if (mutation === 'custom') order.purchase_units[0].custom_id = 'other-request';
    await assert.rejects(
      service.capture(p.id, mutation === 'order' ? 'UNRELATED-ORDER' : p.orderId!),
    );
    assert.equal(provider.captureCalls.length, 0);
    assert.equal(store.budget().reservedCents, 1800);
    store.close();
  }
});
test('tampered approval binding or saved basket cannot capture', async () => {
  for (const field of [
    'basketHash',
    'amountCents',
    'mandateVersion',
    'expiresAt',
    'requestId',
  ] as const) {
    const { service, store, provider } = fixture();
    const p = submit(service, 'GIFT-01');
    service.decide(p.id, 'approve', p.basketHash);
    const ready = await service.checkout(p.id);
    provider.approve(ready.orderId!);
    const current = store.get(p.id)!;
    (current.approval as unknown as Record<string, unknown>)[field] =
      field === 'amountCents' || field === 'mandateVersion' ? 0 : 'changed';
    store.save(current);
    await assert.rejects(service.capture(p.id, ready.orderId!));
    assert.equal(provider.captureCalls.length, 0);
    store.close();
  }
});
test('lost create response reuses saved operation, even after request expiry', async () => {
  const { service, store, provider } = fixture();
  provider.failCreate = true;
  const p = await service.checkout(submit(service).id);
  assert.equal(p.state, 'CREATE_UNKNOWN');
  const expired = store.get(p.id)!;
  expired.expiresAt = new Date(0).toISOString();
  store.save(expired);
  store.expire();
  assert.equal(store.budget().reservedCents, 1800);
  provider.failCreate = false;
  await service.reconcile(p.id);
  assert.equal(provider.orders.size, 1);
  assert.equal(provider.createCalls[0], provider.createCalls[1]);
  assert.equal(store.get(p.id)?.state, 'EXPIRED');
  assert.equal(store.budget().reservedCents, 0);
  store.close();
});
test('lost capture response preserves reservation and reconciliation counts spend exactly once', async () => {
  const { service, store, provider } = fixture();
  provider.captureMode = 'lost';
  const p = await service.checkout(submit(service).id);
  provider.approve(p.orderId!);
  assert.equal((await service.capture(p.id, p.orderId!)).state, 'CHECKING');
  assert.equal(store.budget().reservedCents, 1800);
  assert.equal(store.budget().spentCents, 0);
  await assert.rejects(async () => service.cancel(p.id));
  await service.capture(p.id, p.orderId!);
  assert.equal(provider.captureCalls.length, 1);
  service.revoke();
  assert.equal(store.budget().reservedCents, 1800);
  await service.reconcile(p.id);
  await service.reconcile(p.id);
  assert.equal(store.get(p.id)?.state, 'CAPTURED');
  assert.equal(store.budget().spentCents, 1800);
  store.close();
});
test('pending and provider read failures retain reservations; confirmed decline releases', async () => {
  for (const mode of ['pending', 'decline'] as const) {
    const { service, store, provider } = fixture();
    provider.captureMode = mode;
    const p = await service.checkout(submit(service).id);
    provider.approve(p.orderId!);
    const result = await service.capture(p.id, p.orderId!);
    assert.equal(result.state, mode === 'pending' ? 'CHECKING' : 'FAILED');
    assert.equal(store.budget().spentCents, 0);
    assert.equal(store.budget().reservedCents, mode === 'pending' ? 1800 : 0);
    if (mode === 'pending') {
      provider.failRead = true;
      await service.reconcile(p.id);
      assert.equal(store.budget().reservedCents, 1800);
    }
    store.close();
  }
});
test('revocation before capture claim stops capture; revocation after claim cannot undo in-flight payment', async () => {
  {
    const { service, store, provider } = fixture();
    const p = await service.checkout(submit(service).id);
    provider.approve(p.orderId!);
    service.revoke();
    await assert.rejects(service.capture(p.id, p.orderId!));
    assert.equal(provider.captureCalls.length, 0);
    store.close();
  }
  {
    const { service, store, provider } = fixture();
    const p = await service.checkout(submit(service).id);
    provider.approve(p.orderId!);
    provider.afterCapture = () => service.revoke();
    await service.capture(p.id, p.orderId!);
    assert.equal(store.get(p.id)?.state, 'CAPTURED');
    assert.equal(store.budget().spentCents, 1800);
    store.close();
  }
});
test('restart preserves unresolved capture IDs and budget then repairs using saved order', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mandate-restart-'));
  const path = join(dir, 'ledger.sqlite');
  try {
    const { service, store, provider } = fixture(path);
    provider.captureMode = 'lost';
    const p = await service.checkout(submit(service).id);
    provider.approve(p.orderId!);
    await service.capture(p.id, p.orderId!);
    const interrupted = store.get(p.id)!;
    interrupted.state = 'CAPTURING';
    store.save(interrupted);
    const operation = store.operation(p.id, 'capture')!.operation_id;
    store.close();
    const reopened = new Store(path);
    reopened.recover();
    assert.equal(reopened.get(p.id)?.state, 'CHECKING');
    assert.equal(reopened.budget().reservedCents, 1800);
    assert.equal(reopened.operation(p.id, 'capture')!.operation_id, operation);
    const recovered = new PurchasingService(reopened, provider);
    await recovered.reconcile(p.id);
    assert.equal(reopened.budget().spentCents, 1800);
    assert.equal(provider.captureCalls.length, 1);
    reopened.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('unsafe provider redirects and malformed monetary values are rejected', () => {
  for (const href of [
    'https://attacker.example/pay',
    'http://www.sandbox.paypal.com/pay',
    'https://www.sandbox.paypal.com.attacker.example/pay',
    'https://u:p@www.sandbox.paypal.com/pay',
  ])
    assert.throws(() =>
      approvalUrl({
        id: 'a',
        status: 'CREATED',
        purchase_units: [],
        links: [{ rel: 'approve', href }],
      }),
    );
  for (const value of ['18', '18.001', '-18.00', '1e2', '018.00'])
    assert.throws(() => cents({ currency_code: 'USD', value }));
  assert.equal(cents({ currency_code: 'USD', value: '18.01' }), 1801);
});
