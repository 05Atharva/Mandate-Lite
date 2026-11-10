import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'vite';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import type { AddressInfo } from 'node:net';

test('development server blocks runtime files through normal and @fs URLs', async () => {
  const base = resolve('.local');
  await mkdir(base, { recursive: true });
  const dir = await mkdtemp(resolve(base, 'dev-security-'));
  assert.ok(dir.startsWith(base + sep));
  const file = resolve(dir, 'ledger.sqlite');
  await writeFile(file, 'test-only-private-ledger');
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'spa' });
  const app = express();
  app.use(vite.middlewares);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolveReady) => server.once('listening', resolveReady));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const path = '/' + relative(process.cwd(), file).split(sep).join('/');
    for (const url of [path, '/@fs/' + file.split(sep).join('/')]) {
      const response = await fetch(origin + url);
      assert.equal(response.status, 403);
      assert.ok(!(await response.text()).includes('test-only-private-ledger'));
    }
    assert.equal((await fetch(origin + '/')).status, 200);
  } finally {
    await new Promise<void>((resolveClosed) => server.close(() => resolveClosed()));
    await vite.close();
    await rm(dir, { recursive: true, force: true });
  }
});
