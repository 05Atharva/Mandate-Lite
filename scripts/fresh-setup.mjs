import { spawn, execFileSync } from 'node:child_process';
import { mkdir, copyFile, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve, join, dirname, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

const root = process.cwd();
await mkdir(resolve('.local'), { recursive: true });
const checkout = await mkdtemp(resolve('.local/fresh-setup-'));
const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean);
for (const file of files) {
  if (file === '.env' || (file.startsWith('.env.') && file !== '.env.example')) continue;
  const target = resolve(checkout, file);
  assert.ok(target.startsWith(checkout + sep));
  await mkdir(dirname(target), { recursive: true });
  await copyFile(resolve(root, file), target);
}
const npmCli = process.env.npm_execpath;
assert.ok(npmCli, 'Run this script with npm run verify:fresh.');
const run = (args) =>
  new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [npmCli, ...args], {
      cwd: checkout,
      stdio: 'inherit',
      env: process.env,
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0
        ? resolveRun()
        : reject(new Error(`Fresh setup command failed: npm ${args.join(' ')}`)),
    );
  });
console.log('Fresh setup: installing dependencies into an isolated checkout.');
await run(['ci', '--prefer-offline', '--cache', resolve(root, '.local/npm-cache')]);
await run(['test']);
await run(['run', 'build']);
await run(['run', 'db:seed']);
const listener = createServer();
await new Promise((resolvePort) => listener.listen(0, '127.0.0.1', resolvePort));
const port = listener.address().port;
await new Promise((resolvePort) => listener.close(resolvePort));
const origin = `http://127.0.0.1:${port}`;
const password = randomBytes(32).toString('hex');
const agentKey = randomBytes(32).toString('hex');
const child = spawn(process.execPath, ['dist/server/server/index.js'], {
  cwd: checkout,
  stdio: ['ignore', 'ignore', 'pipe'],
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(port),
    APP_URL: origin,
    DATABASE_PATH: join(checkout, 'data/smoke.sqlite'),
    OWNER_PASSWORD: password,
    AGENT_API_KEY: agentKey,
    LLM_PROVIDER: 'openai',
    OPENAI_API_KEY: '',
    GROQ_API_KEY: '',
    PAYPAL_CLIENT_ID: '',
    PAYPAL_CLIENT_SECRET: '',
    PAYPAL_MERCHANT_ID: '',
    COOKIE_SECURE: 'false',
  },
});
let processError = '';
child.stderr.on('data', (chunk) => {
  processError += String(chunk);
});
try {
  let healthy = false;
  for (let i = 0; i < 100; i++) {
    try {
      const response = await fetch(origin + '/api/health', { signal: AbortSignal.timeout(500) });
      if (response.ok) {
        healthy = true;
        break;
      }
    } catch {}
    await delay(100);
  }
  assert.ok(healthy, `Production smoke server failed to become ready. ${processError}`);
  const page = await fetch(origin);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.ok(html.includes('Mandate Lite'));
  const asset = html.match(/src="([^"]+\.js)"/)?.[1];
  assert.ok(asset);
  const bundle = await (await fetch(origin + asset)).text();
  assert.ok(!bundle.includes(password));
  assert.ok(!bundle.includes(agentKey));
  const login = await fetch(origin + '/api/session', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const { csrfToken } = await login.json();
  const post = (path, body) =>
    fetch(origin + '/api' + path, {
      method: 'POST',
      headers: {
        Cookie: cookie,
        Origin: origin,
        'X-CSRF-Token': csrfToken,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'fresh-setup-smoke',
      },
      body: JSON.stringify(body),
    });
  assert.equal(
    (
      await post('/mandate', {
        budgetCents: 40000,
        maxOrderCents: 20000,
        ownerReviewAboveCents: 15000,
        allowedCategories: ['kitchen', 'office', 'gifts'],
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      })
    ).status,
    201,
  );
  const request = await post('/intents', {
    title: 'Fresh setup coffee',
    currency: 'USD',
    items: [{ sku: 'COFFEE-01', quantity: 1 }],
  });
  assert.equal(request.status, 201);
  const purchase = await request.json();
  assert.equal(purchase.state, 'READY');
  assert.equal((await post(`/intents/${purchase.id}/checkout`, {})).status, 503);
  const result = {
    executedAt: new Date().toISOString(),
    checkout,
    install: true,
    tests: true,
    build: true,
    seed: true,
    productionHttp: true,
    ownerLogin: true,
    policySubmission: true,
    secretsAbsentFromClient: true,
    modelOrPaymentCalls: false,
  };
  await writeFile(resolve(root, '.local/fresh-setup-report.json'), JSON.stringify(result, null, 2));
  console.log(
    'Fresh setup passed: npm ci, tests, build, seed, production HTTP, owner login and policy submission. Report: .local/fresh-setup-report.json',
  );
} finally {
  child.kill('SIGTERM');
}
