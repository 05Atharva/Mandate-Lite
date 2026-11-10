import { loadEnvFile } from 'node:process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { Store } from '../server/store.js';
import { PurchasingService } from '../server/service.js';
import { PayPal } from '../server/paypal.js';
import { Planner } from '../server/planner.js';
import { modelConfig } from '../server/model-config.js';
if (existsSync('.env')) loadEnvFile('.env');
const config = modelConfig(process.env);
if (!config.apiKey) {
  console.error('Configure the selected model provider key in .env first. No calls were made.');
  process.exit(1);
}
const store = new Store(':memory:');
const service = new PurchasingService(store, new PayPal('', '', '', 'http://localhost:3000'));
service.activate({
  budgetCents: 40000,
  maxOrderCents: 20000,
  ownerReviewAboveCents: 15000,
  allowedCategories: ['kitchen', 'office', 'gifts'],
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
});
const prompts = [
  'Restock one 500 g bag of studio blend coffee.',
  'We have six new starters. Choose one reusable pen set per person under $80; avoid electrical items.',
  'Choose one celebration hamper for six people.',
  'Buy something nice for the team.',
  'I need a nut-free hamper for six people.',
];
const planner = new Planner(store, config.apiKey, config.model, config.provider);
const results: unknown[] = [];
try {
  for (const need of prompts) {
    const start = performance.now();
    try {
      const plan = await planner.plan(need, 'studio-agent');
      results.push({
        need,
        durationMs: Math.round(performance.now() - start),
        plan,
        humanReview: 'pending',
      });
    } catch (error) {
      results.push({
        need,
        error: error instanceof Error ? error.message : 'Model evaluation failed',
        humanReview: 'pending',
      });
    }
  }
  mkdirSync('data', { recursive: true });
  writeFileSync(
    'data/model-evaluation.json',
    JSON.stringify(
      {
        executedAt: new Date().toISOString(),
        provider: config.provider,
        model: config.model,
        liveModelCalls: true,
        paymentCalls: false,
        results,
      },
      null,
      2,
    ),
  );
  console.log(
    'Saved data/model-evaluation.json. Review all five selections/clarifications manually; this script never creates a payment.',
  );
} finally {
  store.close();
}
