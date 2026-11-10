import { Store } from '../server/store.js';
import { PurchasingService } from '../server/service.js';
import { FakePayPal } from './fixtures.js';
const store = new Store(process.argv[2]);
const svc = new PurchasingService(store, new FakePayPal());
const p = svc.submit({ title: 'Concurrent gift', currency: 'USD', items: [{ sku: 'GIFT-01', quantity: 1 }] }, `concurrent-${process.argv[3]}`, 'studio-agent');
console.log(p.state); store.close();
