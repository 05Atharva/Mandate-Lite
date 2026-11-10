import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Identities } from '../server/identity.js';
import { Store } from '../server/store.js';

test('identity hashes persist, revocation survives restart, and credential rotation invalidates sessions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mandate-identity-'));
  const path = join(dir, 'ledger.sqlite');
  try {
    const store = new Store(path);
    const ids = new Identities(store, 'owner-password', 'agent-secret');
    assert.ok(ids.verifyOwner('owner-password'));
    assert.ok(!ids.verifyOwner('wrong-password'));
    assert.ok(ids.authenticateAgent('agent-secret'));
    const saved = JSON.stringify({ owner: ids.owner(), agent: ids.agent() });
    assert.ok(!saved.includes('owner-password'));
    assert.ok(!saved.includes('agent-secret'));
    const salt = ids.owner().password_salt;
    store.db
      .prepare('INSERT INTO sessions VALUES(?,?,?,?,?)')
      .run(
        'session-hash',
        'csrf-hash',
        new Date(Date.now() + 60000).toISOString(),
        'owner',
        ids.owner().credential_version,
      );
    ids.revokeAgent();
    store.close();
    const reopened = new Store(path);
    const again = new Identities(reopened, 'owner-password', 'agent-secret');
    assert.equal(again.owner().password_salt, salt);
    assert.ok(!again.authenticateAgent('agent-secret'));
    assert.equal(reopened.db.prepare('SELECT COUNT(*) AS n FROM sessions').get()!.n, 1);
    const rotated = new Identities(reopened, 'new-owner-password', 'new-agent-secret');
    assert.ok(!rotated.verifyOwner('owner-password'));
    assert.ok(rotated.verifyOwner('new-owner-password'));
    assert.ok(rotated.authenticateAgent('new-agent-secret'));
    assert.equal(reopened.db.prepare('SELECT COUNT(*) AS n FROM sessions').get()!.n, 0);
    reopened.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('persisted identities work without resupplying plaintext and equal credentials are rejected', () => {
  const store = new Store(':memory:');
  new Identities(store, 'owner-secret', 'agent-secret');
  const persisted = new Identities(store, '', '');
  assert.ok(persisted.verifyOwner('owner-secret'));
  assert.ok(persisted.authenticateAgent('agent-secret'));
  assert.throws(() => new Identities(store, 'same', 'same'), /must differ/);
  store.close();
});
