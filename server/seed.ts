import { loadEnvFile } from 'node:process';
import { existsSync } from 'node:fs';
import { Store } from './store.js';
if (existsSync('.env')) loadEnvFile('.env');
const store = new Store(process.env.DATABASE_PATH || './data/mandate.sqlite');
console.log(`Catalog ready: ${store.products().length} products. Existing mandates, requests, and payments preserved.`);
store.close();
