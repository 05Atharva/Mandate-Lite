import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Store } from './store.js';
import { ensure } from './errors.js';

export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const sameHash = (a: string, b: string) =>
  /^[a-f0-9]{64}$/.test(a) &&
  /^[a-f0-9]{64}$/.test(b) &&
  timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));

export class Identities {
  constructor(
    private store: Store,
    ownerPassword: string,
    agentKey: string,
  ) {
    ensure(
      !ownerPassword || !agentKey || ownerPassword !== agentKey,
      500,
      'CREDENTIAL_SEPARATION',
      'Owner and agent credentials must differ.',
    );
    store.tx(() => {
      const owner = this.owner();
      if (ownerPassword && (!owner.password_hash || !this.verifyOwner(ownerPassword))) {
        const salt = randomBytes(32).toString('hex');
        const passwordHash = scryptSync(ownerPassword, salt, 64).toString('hex');
        store.db
          .prepare(
            'UPDATE owners SET password_hash=?,password_salt=?,credential_version=credential_version+1 WHERE id=?',
          )
          .run(passwordHash, salt, 'owner');
        store.db.prepare('DELETE FROM sessions').run();
        store.event(null, 'operator', 'OWNER_CREDENTIAL_CONFIGURED');
      }
      const agent = this.agent();
      if (agentKey && !sameHash(digest(agentKey), String(agent.key_hash ?? ''))) {
        store.db
          .prepare('UPDATE agents SET key_hash=?,active=1 WHERE id=?')
          .run(digest(agentKey), 'studio-agent');
        store.event(null, 'operator', 'AGENT_CREDENTIAL_CONFIGURED');
      }
    });
  }
  owner() {
    return this.store.db.prepare('SELECT * FROM owners WHERE id=?').get('owner')!;
  }
  agent() {
    return this.store.db.prepare('SELECT * FROM agents WHERE id=?').get('studio-agent')!;
  }
  verifyOwner(password: string) {
    const owner = this.owner();
    return Boolean(
      owner.active &&
      owner.password_hash &&
      timingSafeEqual(
        scryptSync(password, String(owner.password_salt), 64),
        Buffer.from(String(owner.password_hash), 'hex'),
      ),
    );
  }
  authenticateAgent(key: string) {
    const agent = this.agent();
    return Boolean(agent.active && key && sameHash(digest(key), String(agent.key_hash ?? '')));
  }
  revokeAgent() {
    this.store.tx(() => {
      this.store.db.prepare('UPDATE agents SET active=0 WHERE id=?').run('studio-agent');
      this.store.event(null, 'owner', 'AGENT_REVOKED');
    });
  }
}
