import { Store } from '../server/store.js';
import { PurchasingService } from '../server/service.js';
import type { PaymentProvider, ProviderOrder } from '../server/paypal.js';
import type { Purchase } from '../shared/types.js';
export class FakePayPal implements PaymentProvider {
  configured = true; merchantId = 'SELLER-TEST'; createCalls: string[] = []; captureCalls: string[] = [];
  orders = new Map<string, ProviderOrder>(); captureMode: 'complete' | 'pending' | 'decline' | 'lost' = 'complete';
  failCreate = false; failRead = false; afterCapture?: () => void;
  async create(p: Purchase, key: string) {
    this.createCalls.push(key);
    const id = `ORDER-${key}`;
    const existing = this.orders.get(id);
    if (!existing) this.orders.set(id, { id, status: 'CREATED', purchase_units: [{ reference_id: p.id, custom_id: p.id, payee: { merchant_id: this.merchantId }, amount: { currency_code: 'USD', value: (p.amountCents / 100).toFixed(2) } }], links: [{ rel: 'payer-action', href: `https://www.sandbox.paypal.com/checkoutnow?token=${id}` }] });
    if (this.failCreate) throw new Error('Simulated lost create response');
    return structuredClone(this.orders.get(id)!);
  }
  async read(id: string) { if (this.failRead) throw new Error('Unavailable'); return structuredClone(this.orders.get(id)!); }
  approve(id: string) { this.orders.get(id)!.status = 'APPROVED'; }
  async capture(id: string, key: string) {
    this.captureCalls.push(key); this.afterCapture?.();
    const o = this.orders.get(id)!;
    o.status = this.captureMode === 'pending' ? 'APPROVED' : 'COMPLETED';
    o.purchase_units[0].payments = { captures: [{ id: `CAPTURE-${key}`, status: this.captureMode === 'pending' ? 'PENDING' : this.captureMode === 'decline' ? 'DECLINED' : 'COMPLETED', amount: o.purchase_units[0].amount, final_capture: true }] };
    if (this.captureMode === 'lost') throw new Error('Simulated lost response after provider captured');
    return structuredClone(o);
  }
}
export const defaultMandate = () => ({ budgetCents: 40000, maxOrderCents: 20000, ownerReviewAboveCents: 15000, allowedCategories: ['kitchen', 'office', 'gifts'], expiresAt: new Date(Date.now() + 86400000).toISOString() });
export function fixture(path = ':memory:') { const store = new Store(path); const provider = new FakePayPal(); const service = new PurchasingService(store, provider); service.activate(defaultMandate()); return { store, provider, service }; }
let sequence = 0;
export function submit(service: PurchasingService, sku = 'COFFEE-01', quantity = 1, key = `request-${++sequence}`) { return service.submit({ title: 'Test purchase', currency: 'USD', items: [{ sku, quantity }] }, key, 'studio-agent'); }
