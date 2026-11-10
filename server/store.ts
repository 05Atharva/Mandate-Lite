import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AuditEvent, Budget, Mandate, Product, Purchase } from '../shared/types.js';
import { catalog } from './catalog.js';

export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);
      INSERT OR IGNORE INTO schema_version VALUES(1);
      CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, demo INTEGER NOT NULL CHECK(demo IN (0,1)));
      CREATE TABLE IF NOT EXISTS owners (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), password_hash TEXT, password_salt TEXT, active INTEGER NOT NULL, credential_version INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), key_hash TEXT, active INTEGER NOT NULL);
      INSERT OR IGNORE INTO workspaces VALUES('studio',1);
      INSERT OR IGNORE INTO owners(id,workspace_id,active) VALUES('owner','studio',1);
      INSERT OR IGNORE INTO agents VALUES('studio-agent','studio',NULL,0);
      CREATE TABLE IF NOT EXISTS catalog (sku TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS mandate (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS purchases (id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, request_key TEXT NOT NULL, body_hash TEXT NOT NULL, data TEXT NOT NULL, UNIQUE(agent_id, request_key));
      CREATE TABLE IF NOT EXISTS reservations (request_id TEXT PRIMARY KEY REFERENCES purchases(id), amount INTEGER NOT NULL CHECK(amount>0), state TEXT NOT NULL CHECK(state IN ('active','committed','released')));
      CREATE TABLE IF NOT EXISTS operations (request_id TEXT NOT NULL REFERENCES purchases(id), kind TEXT NOT NULL, operation_id TEXT NOT NULL UNIQUE, state TEXT NOT NULL, started_at TEXT NOT NULL, PRIMARY KEY(request_id,kind));
      CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, request_id TEXT REFERENCES purchases(id), actor TEXT NOT NULL, type TEXT NOT NULL, data TEXT NOT NULL, at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, csrf_hash TEXT NOT NULL, expires_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS owner_decisions (request_id TEXT PRIMARY KEY REFERENCES purchases(id), owner_id TEXT NOT NULL REFERENCES owners(id), decision TEXT NOT NULL CHECK(decision IN ('approve','reject')), basket_hash TEXT NOT NULL, amount INTEGER NOT NULL, mandate_version INTEGER NOT NULL, expires_at TEXT NOT NULL, decided_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS checkout_sessions (request_id TEXT NOT NULL REFERENCES purchases(id), session_hash TEXT NOT NULL REFERENCES sessions(token_hash) ON DELETE CASCADE, expires_at TEXT NOT NULL, PRIMARY KEY(request_id,session_hash));
    `);
    const sessionColumns = this.db.prepare('PRAGMA table_info(sessions)').all();
    if (!sessionColumns.some((c) => c.name === 'owner_id'))
      this.db.exec('ALTER TABLE sessions ADD COLUMN owner_id TEXT REFERENCES owners(id)');
    if (!sessionColumns.some((c) => c.name === 'credential_version'))
      this.db.exec('ALTER TABLE sessions ADD COLUMN credential_version INTEGER NOT NULL DEFAULT 1');
    this.db.exec(
      "UPDATE sessions SET owner_id='owner' WHERE owner_id IS NULL; INSERT OR IGNORE INTO schema_version VALUES(2);",
    );
    const seed = this.db.prepare('INSERT OR IGNORE INTO catalog(sku,data) VALUES(?,?)');
    this.tx(() => {
      for (const item of catalog) seed.run(item.sku, JSON.stringify(item));
    });
  }
  tx<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  products(): Product[] {
    return this.db
      .prepare('SELECT data FROM catalog ORDER BY sku')
      .all()
      .map((r) => JSON.parse(String(r.data)));
  }
  mandate(): Mandate | null {
    const row = this.db.prepare('SELECT data FROM mandate WHERE id=1').get();
    return row ? JSON.parse(String(row.data)) : null;
  }
  saveMandate(m: Mandate) {
    this.db
      .prepare('INSERT INTO mandate VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data')
      .run(JSON.stringify(m));
  }
  get(id: string): Purchase | null {
    const row = this.db.prepare('SELECT data FROM purchases WHERE id=?').get(id);
    return row ? JSON.parse(String(row.data)) : null;
  }
  list(): Purchase[] {
    return this.db
      .prepare('SELECT data FROM purchases ORDER BY rowid DESC')
      .all()
      .map((r) => JSON.parse(String(r.data)));
  }
  save(p: Purchase) {
    this.db.prepare('UPDATE purchases SET data=? WHERE id=?').run(JSON.stringify(p), p.id);
  }
  reservation(id: string) {
    return this.db.prepare('SELECT state,amount FROM reservations WHERE request_id=?').get(id);
  }
  budget(): Budget {
    const rows = this.db
      .prepare('SELECT state, SUM(amount) AS amount FROM reservations GROUP BY state')
      .all();
    const spentCents = Number(rows.find((r) => r.state === 'committed')?.amount ?? 0);
    const reservedCents = Number(rows.find((r) => r.state === 'active')?.amount ?? 0);
    return {
      spentCents,
      reservedCents,
      availableCents: Math.max(0, (this.mandate()?.budgetCents ?? 0) - spentCents - reservedCents),
    };
  }
  release(id: string) {
    this.db
      .prepare("UPDATE reservations SET state='released' WHERE request_id=? AND state='active'")
      .run(id);
  }
  event(requestId: string | null, actor: string, type: string, data: Record<string, unknown> = {}) {
    this.db
      .prepare('INSERT INTO audit(request_id,actor,type,data,at) VALUES(?,?,?,?,?)')
      .run(requestId, actor, type, JSON.stringify(data), new Date().toISOString());
  }
  events(): AuditEvent[] {
    return this.db
      .prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 1000')
      .all()
      .map((r) => ({
        id: Number(r.id),
        requestId: r.request_id as string | null,
        actor: String(r.actor),
        type: String(r.type),
        data: JSON.parse(String(r.data)),
        at: String(r.at),
      }));
  }
  operation(id: string, kind: string) {
    return this.db.prepare('SELECT * FROM operations WHERE request_id=? AND kind=?').get(id, kind);
  }
  createOperation(id: string, kind: string) {
    const key = randomUUID();
    this.db
      .prepare("INSERT INTO operations VALUES(?,?,?,'inflight',?)")
      .run(id, kind, key, new Date().toISOString());
    return key;
  }
  finishOperation(id: string, kind: string, state: string) {
    this.db
      .prepare('UPDATE operations SET state=? WHERE request_id=? AND kind=?')
      .run(state, id, kind);
  }
  expire(now = new Date().toISOString()) {
    this.tx(() => {
      const m = this.mandate();
      for (const p of this.list()) {
        if (!['REVIEW', 'READY', 'CHECKOUT'].includes(p.state)) continue;
        if (p.expiresAt > now && m && !m.revokedAt && m.expiresAt > now) continue;
        p.state = m?.revokedAt ? 'REVOKED' : 'EXPIRED';
        this.release(p.id);
        this.save(p);
        this.event(p.id, 'gateway', p.state);
      }
    });
  }
  recover() {
    this.tx(() => {
      for (const p of this.list()) {
        if (p.state === 'CREATING_ORDER') {
          p.state = 'CREATE_UNKNOWN';
          p.error = 'Order creation was interrupted. Reconcile the saved operation.';
          this.save(p);
          this.event(p.id, 'gateway', 'RESTART_RECOVERY');
        }
        if (p.state === 'CAPTURING') {
          p.state = 'CHECKING';
          p.error = 'Checking payment after restart. Reservation retained.';
          this.save(p);
          this.event(p.id, 'gateway', 'RESTART_RECOVERY');
        }
      }
    });
    this.expire();
  }
  close() {
    this.db.close();
  }
}
