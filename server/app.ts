import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { z, ZodError } from 'zod';
import { AppError, ensure } from './errors.js';
import { PurchasingService } from './service.js';
import { Planner } from './planner.js';
import type { Store } from './store.js';
import type { PaymentProvider } from './paypal.js';

export interface AppConfig { appUrl: string; ownerPassword: string; agentKey: string; secureCookie: boolean; openaiKey: string; model: string }
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
const constantEqual = (a: string, b: string) => timingSafeEqual(Buffer.from(digest(a), 'hex'), Buffer.from(digest(b), 'hex'));
type ActorRequest = Request & { actor?: 'owner' | 'agent'; sessionHash?: string; sessionCsrfToken?: string };
export function createApp(store: Store, provider: PaymentProvider, config: AppConfig) {
  const app = express(); const service = new PurchasingService(store, provider); const planner = new Planner(store, config.openaiKey, config.model);
  const passwordSalt = randomBytes(32);
  const passwordHash = config.ownerPassword ? scryptSync(config.ownerPassword, passwordSalt, 64) : null;
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'", ...(process.env.NODE_ENV === 'production' ? [] : ["'unsafe-inline'"])], connectSrc: ["'self'", ...(process.env.NODE_ENV === 'production' ? [] : ['ws://localhost:*'])], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:'], formAction: ["'self'"], frameAncestors: ["'none'"] } }, strictTransportSecurity: config.secureCookie ? undefined : false }));
  app.use(express.json({ limit: '16kb' }));
  app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  app.use('/api', rateLimit({ windowMs: 60000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }));
  function auth(req: ActorRequest, _res: Response, next: NextFunction) {
    const cookie = req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith('mandate_session='))?.slice('mandate_session='.length);
    if (cookie) {
      const tokenHash = digest(cookie); const session = store.db.prepare('SELECT * FROM sessions WHERE token_hash=? AND expires_at>?').get(tokenHash, new Date().toISOString());
      if (session) {
        if (!['GET', 'HEAD'].includes(req.method)) ensure(req.headers.origin === config.appUrl && constantEqual(digest(String(req.headers['x-csrf-token'] ?? '')), String(session.csrf_hash)), 403, 'CSRF', 'Session mutation requires the same origin and CSRF token.');
        req.actor = 'owner'; req.sessionHash = tokenHash; req.sessionCsrfToken = digest(`csrf:${cookie}`); return next();
      }
    }
    const key = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
    if (config.agentKey && key && constantEqual(key, config.agentKey)) { req.actor = 'agent'; return next(); }
    throw new AppError(401, 'AUTH_REQUIRED', 'Sign in as the owner or provide the agent API credential.');
  }
  const owner = (req: ActorRequest, _res: Response, next: NextFunction) => { ensure(req.actor === 'owner', 403, 'OWNER_REQUIRED', 'Only the authenticated owner can perform this action.'); next(); };
  app.get('/api/health', (_req, res) => res.json({ ok: true, mode: 'sandbox', ownerConfigured: Boolean(passwordHash), agentConfigured: Boolean(config.agentKey), paypalConfigured: provider.configured, plannerConfigured: planner.configured, model: planner.model }));
  app.post('/api/session', rateLimit({ windowMs: 15 * 60000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false }), (req, res) => {
    ensure(req.headers.origin === config.appUrl, 403, 'ORIGIN', 'Login must use the application origin.');
    const value = z.strictObject({ password: z.string().min(1).max(1024) }).parse(req.body);
    ensure(passwordHash, 503, 'OWNER_NOT_CONFIGURED', 'Set OWNER_PASSWORD in .env and restart the server.');
    ensure(timingSafeEqual(scryptSync(value.password, passwordSalt, 64), passwordHash), 401, 'LOGIN_FAILED', 'The owner password is incorrect.');
    const token = randomBytes(32).toString('hex'); const csrfToken = digest(`csrf:${token}`);
    store.db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(new Date().toISOString());
    store.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token), digest(csrfToken), new Date(Date.now() + 8 * 3600000).toISOString());
    res.cookie('mandate_session', token, { httpOnly: true, secure: config.secureCookie, sameSite: 'lax', maxAge: 8 * 3600000, path: '/' }); res.json({ csrfToken, role: 'owner' });
  });
  app.use('/api', auth);
  app.get('/api/session', owner, (req: ActorRequest, res) => {
    res.json({ csrfToken: req.sessionCsrfToken, role: 'owner' });
  });
  app.delete('/api/session', owner, (req: ActorRequest, res) => { store.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(req.sessionHash!); res.clearCookie('mandate_session', { path: '/' }); res.json({ ok: true }); });
  app.get('/api/catalog', (_req, res) => res.json(store.products()));
  app.get('/api/mandate', (_req, res) => { store.expire(); res.json({ mandate: store.mandate(), budget: store.budget() }); });
  app.post('/api/mandate', owner, (req, res) => res.status(201).json(service.activate(req.body)));
  app.post('/api/mandate/revoke', owner, (_req, res) => { service.revoke(); res.json({ mandate: store.mandate(), budget: store.budget() }); });
  const modelLimit = rateLimit({ windowMs: 60000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false });
  app.post('/api/plans', modelLimit, async (req, res) => { const { need } = z.strictObject({ need: z.string().trim().min(5).max(2000) }).parse(req.body); res.json(await planner.plan(need, 'studio-agent')); });
  app.post('/api/intents', (req, res) => res.status(201).json(service.submit(req.body, String(req.headers['idempotency-key'] ?? ''), 'studio-agent')));
  app.get('/api/intents/:id', (req: ActorRequest, res) => { store.expire(); const p = service.require(String(req.params.id), req.actor === 'agent' ? 'studio-agent' : undefined); const operations = store.db.prepare('SELECT kind,operation_id,state,started_at FROM operations WHERE request_id=?').all(p.id); const plan = p.planId ? store.db.prepare('SELECT data FROM plans WHERE id=?').get(p.planId) : null; res.json({ purchase: p, operations, plan: plan ? JSON.parse(String(plan.data)) : null }); });
  app.post('/api/intents/:id/decision', owner, (req, res) => { const value = z.strictObject({ decision: z.enum(['approve', 'reject']), basketHash: z.string().length(64) }).parse(req.body); res.json(service.decide(String(req.params.id), value.decision, value.basketHash)); });
  app.post('/api/intents/:id/checkout', owner, async (req, res) => { z.strictObject({}).parse(req.body); res.json(await service.checkout(String(req.params.id))); });
  app.post('/api/intents/:id/capture', owner, async (req, res) => { const { orderId } = z.strictObject({ orderId: z.string().min(1).max(100) }).parse(req.body); res.json(await service.capture(String(req.params.id), orderId)); });
  app.post('/api/intents/:id/reconcile', owner, async (req, res) => { z.strictObject({}).parse(req.body); res.json(await service.reconcile(String(req.params.id))); });
  app.post('/api/intents/:id/cancel', owner, (req, res) => { z.strictObject({}).parse(req.body); res.json(service.cancel(String(req.params.id))); });
  app.get('/api/dashboard', owner, (_req, res) => { store.expire(); res.json({ mandate: store.mandate(), budget: store.budget(), purchases: store.list(), audit: store.events() }); });
  app.get('/api/audit', owner, (_req, res) => { store.expire(); res.json({ events: store.events(), purchases: store.list(), mandate: store.mandate(), budget: store.budget() }); });
  return { app, service, errors: (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ZodError) { res.status(400).json({ code: 'VALIDATION', message: error.issues.map(i => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ') }); return; }
    if (error instanceof AppError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    if (error instanceof SyntaxError) { res.status(400).json({ code: 'JSON', message: 'Invalid JSON request body.' }); return; }
    res.status(500).json({ code: 'INTERNAL', message: 'The operation could not be completed. Refresh the request before retrying.' });
  } };
}
