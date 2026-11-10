import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fixture, submit, defaultMandate } from './fixtures.js';
import { Store } from '../server/store.js';
import { PurchasingService } from '../server/service.js';
import { FakePayPal } from './fixtures.js';

test('coffee allowed, gift reviewed, machine blocked before any provider call', () => {
  const { service, store, provider } = fixture();
  assert.equal(submit(service).state, 'READY');
  assert.equal(submit(service, 'GIFT-01').state, 'REVIEW');
  const blocked = submit(service, 'ESPRESSO-01');
  assert.equal(blocked.state, 'BLOCKED');
  assert.deepEqual(
    blocked.rules.filter((r) => !r.passed).map((r) => r.id),
    ['CATEGORY_ALLOWED', 'ORDER_CAP', 'PILOT_BUDGET'],
  );
  assert.deepEqual(store.budget(), { spentCents: 0, reservedCents: 19800, availableCents: 20200 });
  assert.equal(provider.createCalls.length, 0);
  store.close();
});
test('exact review/cap/budget boundaries use integer cents', () => {
  for (const [amount, state] of [
    [15000, 'READY'],
    [15001, 'REVIEW'],
    [20000, 'REVIEW'],
    [20001, 'BLOCKED'],
  ] as const) {
    const { service, store } = fixture();
    const item = store.products()[0];
    item.unitCents = amount;
    store.db.prepare('UPDATE catalog SET data=? WHERE sku=?').run(JSON.stringify(item), item.sku);
    assert.equal(submit(service, item.sku).state, state);
    store.close();
  }
  const { service, store } = fixture();
  assert.equal(submit(service, 'GIFT-01').state, 'REVIEW');
  assert.equal(submit(service, 'GIFT-01').state, 'REVIEW');
  assert.equal(submit(service, 'COFFEE-01', 2).state, 'READY');
  assert.equal(submit(service, 'STICKY-01').state, 'READY');
  assert.equal(store.budget().availableCents, 0);
  assert.equal(submit(service).state, 'BLOCKED');
  store.close();
});
test('strict input rejects financial fields, invalid quantities, currency and unknown SKUs', () => {
  const { service, store } = fixture();
  const base = { title: 'Supplies', currency: 'USD', items: [{ sku: 'COFFEE-01', quantity: 1 }] };
  for (const input of [
    { ...base, amountCents: 1 },
    { ...base, approved: true },
    { ...base, currency: 'EUR' },
    ...[0, -1, 1.5, true, 21].map((quantity) => ({
      ...base,
      items: [{ sku: 'COFFEE-01', quantity }],
    })),
    { ...base, items: [{ sku: 'UNKNOWN', quantity: 1 }] },
    { ...base, items: [{ sku: 'COFFEE-01', quantity: 1, category: 'office' }] },
  ])
    assert.throws(() => service.submit(input, 'invalid-input-key', 'studio-agent'));
  assert.equal(store.list().length, 0);
  assert.equal(store.budget().reservedCents, 0);
  store.close();
});
test('duplicate SKUs merge before per-SKU and whole-basket limits', () => {
  const { service, store } = fixture();
  const p = service.submit(
    {
      title: 'Aggregate',
      currency: 'USD',
      items: [
        { sku: 'COFFEE-01', quantity: 6 },
        { sku: 'COFFEE-01', quantity: 6 },
      ],
    },
    'aggregate-key',
    'studio-agent',
  );
  assert.equal(p.basket.length, 1);
  assert.equal(p.amountCents, 21600);
  assert.equal(p.state, 'BLOCKED');
  assert.throws(() =>
    service.submit(
      {
        title: 'Aggregate',
        currency: 'USD',
        items: [
          { sku: 'COFFEE-01', quantity: 11 },
          { sku: 'COFFEE-01', quantity: 10 },
        ],
      },
      'aggregate-bad',
      'studio-agent',
    ),
  );
  store.close();
});
test('idempotency resumes same intent and rejects changed body', () => {
  const { service, store } = fixture();
  const first = submit(service, 'COFFEE-01', 1, 'stable-request-key');
  assert.equal(submit(service, 'COFFEE-01', 1, 'stable-request-key').id, first.id);
  assert.throws(() => submit(service, 'COFFEE-01', 2, 'stable-request-key'), /another basket/);
  assert.equal(store.budget().reservedCents, 1800);
  store.close();
});
test('immutable mandate rejects replacement, invalid limits and expired activation', () => {
  const { service, store } = fixture();
  assert.throws(() => service.activate(defaultMandate()), /cannot be replaced/);
  store.close();
  const fresh = new Store(':memory:');
  const svc = new PurchasingService(fresh, new FakePayPal());
  assert.throws(() => svc.activate({ ...defaultMandate(), ownerReviewAboveCents: 30000 }));
  assert.throws(() => svc.activate({ ...defaultMandate(), allowedCategories: [] }));
  assert.throws(() => svc.activate({ ...defaultMandate(), expiresAt: new Date(0).toISOString() }));
  fresh.close();
});
test('approval binds exact basket; rejection releases exactly once', () => {
  const { service, store } = fixture();
  const p = submit(service, 'GIFT-01');
  assert.throws(() => service.decide(p.id, 'approve', '0'.repeat(64)), /does not match/);
  const approved = service.decide(p.id, 'approve', p.basketHash);
  assert.equal(approved.state, 'READY');
  assert.equal(approved.approval?.amountCents, 18000);
  const rejected = submit(service, 'GIFT-01');
  service.decide(rejected.id, 'reject', rejected.basketHash);
  assert.throws(() => service.decide(rejected.id, 'reject', rejected.basketHash));
  assert.equal(store.budget().reservedCents, 18000);
  store.close();
});
test('revocation and lazy expiry block future attempts and safely release', async () => {
  const { service, store } = fixture();
  const p = submit(service);
  p.expiresAt = new Date(0).toISOString();
  store.save(p);
  store.expire();
  assert.equal(store.get(p.id)?.state, 'EXPIRED');
  assert.equal(store.budget().reservedCents, 0);
  await assert.rejects(service.checkout(p.id));
  service.revoke();
  assert.equal(submit(service).state, 'BLOCKED');
  store.close();
});
test('three separate processes cannot overbook $400 with $180 reservations', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mandate-concurrency-'));
  const db = join(dir, 'ledger.sqlite');
  const { store } = fixture(db);
  store.close();
  try {
    const results = await Promise.all(
      [1, 2, 3].map(
        (i) =>
          new Promise<string>((resolve, reject) => {
            const child = spawn(
              process.execPath,
              ['--import', 'tsx', 'tests/reserve-worker.ts', db, String(i)],
              { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] },
            );
            let out = '';
            let err = '';
            child.stdout.on('data', (d) => (out += d));
            child.stderr.on('data', (d) => (err += d));
            child.on('error', reject);
            child.on('close', (code) =>
              code === 0 ? resolve(out.trim()) : reject(new Error(err)),
            );
          }),
      ),
    );
    assert.equal(results.filter((s) => s === 'REVIEW').length, 2);
    assert.equal(results.filter((s) => s === 'BLOCKED').length, 1);
    const reopened = new Store(db);
    assert.equal(reopened.budget().reservedCents, 36000);
    reopened.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
