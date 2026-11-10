import { loadEnvFile } from 'node:process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';
import { Store } from './store.js';
import { PayPal } from './paypal.js';
import { createApp } from './app.js';

if (existsSync('.env')) loadEnvFile('.env');
const port = Number(process.env.PORT || 3000);
const appUrl = new URL(process.env.APP_URL || `http://localhost:${port}`).origin;
const local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(appUrl).hostname);
const secureCookie = process.env.COOKIE_SECURE === 'true';
if (!local && (!secureCookie || !appUrl.startsWith('https://')))
  throw new Error('Non-local deployments require an HTTPS APP_URL and COOKIE_SECURE=true.');
if (process.env.OWNER_PASSWORD && process.env.OWNER_PASSWORD === process.env.AGENT_API_KEY)
  throw new Error('Owner and agent credentials must differ.');
const store = new Store(process.env.DATABASE_PATH || './data/mandate.sqlite');
store.recover();
const provider = new PayPal(
  process.env.PAYPAL_CLIENT_ID || '',
  process.env.PAYPAL_CLIENT_SECRET || '',
  process.env.PAYPAL_MERCHANT_ID || '',
  appUrl,
);
const { app, errors } = createApp(store, provider, {
  appUrl,
  ownerPassword: process.env.OWNER_PASSWORD || '',
  agentKey: process.env.AGENT_API_KEY || '',
  secureCookie,
  openaiKey: process.env.OPENAI_API_KEY || '',
  model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
});
if (process.env.NODE_ENV !== 'production' && !process.argv[1].endsWith('.js')) {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
} else {
  app.use(express.static(resolve('dist/client')));
  app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/client/index.html')));
}
app.use(errors);
const server = app.listen(port, local ? '127.0.0.1' : '0.0.0.0', () => {
  console.log(`Mandate Lite ready at ${appUrl} (PayPal sandbox only)`);
  if (!process.env.OWNER_PASSWORD)
    console.log('Owner access is locked. Set OWNER_PASSWORD in .env to sign in.');
});
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, () => {
    server.close(() => {
      store.close();
      process.exit(0);
    });
  });
