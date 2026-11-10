import { performance } from 'node:perf_hooks';
import { Store } from '../server/store.js';
import { PurchasingService } from '../server/service.js';
import { PayPal } from '../server/paypal.js';
const store = new Store(':memory:');
const service = new PurchasingService(store, new PayPal('', '', '', 'http://localhost:3000'));
service.activate({
  budgetCents: 10000000,
  maxOrderCents: 20000,
  ownerReviewAboveCents: 15000,
  allowedCategories: ['kitchen', 'office', 'gifts'],
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
});
const elapsed: number[] = [];
try {
  for (let i = 0; i < 200; i++) {
    const start = performance.now();
    service.submit(
      {
        title: 'Local performance measurement',
        currency: 'USD',
        items: [{ sku: 'COFFEE-01', quantity: 1 }],
      },
      `benchmark-${i}`,
      'studio-agent',
    );
    elapsed.push(performance.now() - start);
  }
  elapsed.sort((a, b) => a - b);
  console.log(
    JSON.stringify(
      {
        measurement:
          'Full validated intent transaction, including lazy expiry and reservation; in-memory SQLite; no external calls',
        samples: elapsed.length,
        p50Ms: +elapsed[100].toFixed(3),
        p95Ms: +elapsed[190].toFixed(3),
        maxMs: +elapsed.at(-1)!.toFixed(3),
        targetP95Ms: 100,
        budget: store.budget(),
      },
      null,
      2,
    ),
  );
} finally {
  store.close();
}
