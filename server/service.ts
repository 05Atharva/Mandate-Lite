import { randomUUID } from 'node:crypto';
import type { Mandate, Purchase } from '../shared/types.js';
import { Store } from './store.js';
import { ensure } from './errors.js';
import { canonicalBasket, evaluate, hash, intentSchema, mandateSchema, total } from './policy.js';
import {
  approvalUrl,
  cents,
  verifyOrder,
  type PaymentProvider,
  type ProviderOrder,
} from './paypal.js';

export class PurchasingService {
  constructor(
    public store: Store,
    private provider: PaymentProvider,
  ) {}
  activate(input: unknown) {
    const value = mandateSchema.parse(input);
    ensure(
      value.expiresAt > new Date().toISOString(),
      400,
      'MANDATE_EXPIRY',
      'Choose a future expiry.',
    );
    return this.store.tx(() => {
      ensure(
        !this.store.mandate(),
        409,
        'MANDATE_LOCKED',
        'The published pilot mandate cannot be replaced or edited.',
      );
      const mandate: Mandate = {
        ...value,
        allowedCategories: [...new Set(value.allowedCategories)],
        id: 'studio-pilot',
        version: 1,
        currency: 'USD',
        activatedAt: new Date().toISOString(),
        revokedAt: null,
        requestTtlSeconds: 900,
      };
      this.store.saveMandate(mandate);
      this.store.event(null, 'owner', 'MANDATE_ACTIVATED', { mandate });
      return mandate;
    });
  }
  revoke() {
    this.store.tx(() => {
      const m = this.store.mandate();
      ensure(m, 409, 'NO_MANDATE', 'Activate a mandate first.');
      if (!m.revokedAt) {
        m.revokedAt = new Date().toISOString();
        this.store.saveMandate(m);
        this.store.event(null, 'owner', 'MANDATE_REVOKED');
      }
    });
    this.store.expire();
  }
  require(id: string, agentId?: string) {
    const p = this.store.get(id);
    ensure(
      p && (!agentId || p.agentId === agentId),
      404,
      'NOT_FOUND',
      'Purchase request not found.',
    );
    return p;
  }
  submit(input: unknown, requestKey: string, agentId: string) {
    const value = intentSchema.parse(input);
    ensure(
      /^[A-Za-z0-9_-]{8,100}$/.test(requestKey),
      400,
      'REQUEST_KEY',
      'Provide an Idempotency-Key of 8–100 letters, numbers, underscores, or hyphens.',
    );
    this.store.expire();
    return this.store.tx(() => {
      const basket = canonicalBasket(value.items, this.store.products());
      const bodyHash = hash({
        title: value.title,
        currency: value.currency,
        items: basket.map((p) => ({ sku: p.sku, quantity: p.quantity })),
        planId: value.planId ?? null,
      });
      const existing = this.store.db
        .prepare('SELECT id, body_hash FROM purchases WHERE agent_id=? AND request_key=?')
        .get(agentId, requestKey);
      if (existing) {
        ensure(
          existing.body_hash === bodyHash,
          409,
          'IDEMPOTENCY_CONFLICT',
          'This request key was already used with another basket.',
        );
        return this.require(String(existing.id));
      }
      if (value.planId) {
        const row = this.store.db
          .prepare('SELECT data FROM plans WHERE id=? AND agent_id=?')
          .get(value.planId, agentId);
        ensure(row, 400, 'UNKNOWN_PLAN', 'The saved model plan was not found.');
        const plan = JSON.parse(String(row.data));
        ensure(
          plan.output.kind === 'basket' &&
            hash(canonicalBasket(plan.output.items, this.store.products())) === hash(basket),
          400,
          'PLAN_MISMATCH',
          'The submitted selection differs from the saved model plan. Submit modified selections as manual.',
        );
      }
      const m = this.store.mandate();
      ensure(m, 409, 'NO_MANDATE', 'Activate a mandate before submitting a purchase.');
      const now = new Date().toISOString();
      const b = this.store.budget();
      const rules = evaluate(m, basket, b.spentCents + b.reservedCents, now);
      const amount = total(basket);
      const decision = rules.some((r) => !r.passed)
        ? 'block'
        : amount > m.ownerReviewAboveCents
          ? 'review'
          : 'allow';
      rules.push({
        id: 'OWNER_REVIEW',
        passed: decision !== 'review',
        message:
          decision === 'review'
            ? 'Exact basket needs owner approval before checkout.'
            : decision === 'block'
              ? 'Hard rules cannot be overridden by an owner.'
              : 'Within the automatic permission threshold.',
      });
      const p: Purchase = {
        id: randomUUID(),
        agentId,
        title: value.title,
        source: value.planId ? 'model' : 'manual',
        planId: value.planId ?? null,
        basket,
        basketHash: hash(basket),
        amountCents: amount,
        mandateVersion: m.version,
        rules,
        decision,
        state: decision === 'block' ? 'BLOCKED' : decision === 'review' ? 'REVIEW' : 'READY',
        createdAt: now,
        expiresAt: new Date(
          Math.min(Date.now() + m.requestTtlSeconds * 1000, Date.parse(m.expiresAt)),
        ).toISOString(),
        approval: null,
        orderId: null,
        captureId: null,
        checkoutUrl: null,
        error: null,
      };
      this.store.db
        .prepare('INSERT INTO purchases VALUES(?,?,?,?,?)')
        .run(p.id, agentId, requestKey, bodyHash, JSON.stringify(p));
      if (decision !== 'block')
        this.store.db.prepare("INSERT INTO reservations VALUES(?,?,'active')").run(p.id, amount);
      this.store.event(p.id, agentId, 'POLICY_EVALUATED', {
        decision,
        rules,
        basketHash: p.basketHash,
        amountCents: amount,
        mandateVersion: m.version,
      });
      return p;
    });
  }
  decide(id: string, decision: 'approve' | 'reject', basketHash: string) {
    this.store.expire();
    return this.store.tx(() => {
      const p = this.require(id);
      ensure(
        p.state === 'REVIEW',
        409,
        'NOT_REVIEWABLE',
        'Only an active review request can be decided.',
      );
      ensure(p.basketHash === basketHash, 409, 'STALE_BASKET', 'The basket hash does not match.');
      if (decision === 'approve') {
        p.approval = {
          requestId: p.id,
          basketHash: p.basketHash,
          amountCents: p.amountCents,
          mandateVersion: p.mandateVersion,
          expiresAt: p.expiresAt,
          actor: 'owner',
          at: new Date().toISOString(),
        };
        p.state = 'READY';
      } else {
        p.state = 'REJECTED';
        this.store.release(id);
      }
      this.store.db
        .prepare('INSERT INTO owner_decisions VALUES(?,?,?,?,?,?,?,?)')
        .run(
          p.id,
          'owner',
          decision,
          p.basketHash,
          p.amountCents,
          p.mandateVersion,
          p.expiresAt,
          new Date().toISOString(),
        );
      this.store.save(p);
      this.store.event(id, 'owner', decision === 'approve' ? 'OWNER_APPROVED' : 'OWNER_REJECTED', {
        basketHash,
        approval: p.approval,
      });
      return p;
    });
  }
  private preflight(p: Purchase) {
    const m = this.store.mandate();
    const now = new Date().toISOString();
    ensure(
      m && !m.revokedAt && m.expiresAt > now && p.expiresAt > now && p.mandateVersion === m.version,
      409,
      'PERMISSION_EXPIRED',
      'The request or mandate has expired or been revoked.',
    );
    ensure(
      this.store.reservation(p.id)?.state === 'active',
      409,
      'NO_RESERVATION',
      'An active budget reservation is required.',
    );
    ensure(
      hash(p.basket) === p.basketHash &&
        total(p.basket) === p.amountCents &&
        p.decision !== 'block' &&
        p.rules.filter((r) => r.id !== 'OWNER_REVIEW').every((r) => r.passed),
      409,
      'BASKET_INVALID',
      'The saved basket or permission is invalid.',
    );
    if (p.decision === 'review') {
      const a = p.approval;
      ensure(
        a &&
          a.requestId === p.id &&
          a.basketHash === p.basketHash &&
          a.amountCents === p.amountCents &&
          a.mandateVersion === p.mandateVersion &&
          a.expiresAt === p.expiresAt,
        409,
        'APPROVAL_REQUIRED',
        'A bound owner approval is required.',
      );
    }
  }
  async checkout(id: string) {
    ensure(
      this.provider.configured,
      503,
      'PAYPAL_NOT_CONFIGURED',
      'Configure PayPal sandbox credentials before checkout.',
    );
    this.store.expire();
    const claim = this.store.tx(() => {
      const p = this.require(id);
      if (
        [
          'CHECKOUT',
          'CAPTURED',
          'CREATING_ORDER',
          'CREATE_UNKNOWN',
          'CAPTURING',
          'CHECKING',
        ].includes(p.state)
      )
        return { p, key: null };
      ensure(
        p.state === 'READY',
        409,
        'NOT_READY',
        'Only a permitted, approved request can start checkout.',
      );
      this.preflight(p);
      const key = this.store.createOperation(id, 'create');
      p.state = 'CREATING_ORDER';
      this.store.save(p);
      this.store.event(id, 'owner', 'CREATE_CLAIMED', { operationId: key });
      return { p, key };
    });
    if (!claim.key) return claim.p;
    return this.performCreate(claim.p, claim.key);
  }
  private async performCreate(p: Purchase, key: string) {
    try {
      const order = await this.provider.create(p, key);
      verifyOrder(order, p, this.provider.merchantId);
      const checkoutUrl = approvalUrl(order);
      ensure(checkoutUrl, 502, 'NO_APPROVAL_LINK', 'PayPal did not return a buyer approval link.');
      return this.store.tx(() => {
        const current = this.require(p.id);
        current.orderId = order.id;
        current.checkoutUrl = checkoutUrl;
        current.state = 'CHECKOUT';
        current.error = null;
        this.store.save(current);
        this.store.finishOperation(p.id, 'create', 'resolved');
        this.store.event(p.id, 'paypal', 'ORDER_CREATED', { orderId: order.id });
        return current;
      });
    } catch {
      return this.uncertain(
        p.id,
        'CREATE_UNKNOWN',
        'Order creation is unverified. The original operation and reservation are retained.',
      );
    } finally {
      this.store.expire();
    }
  }
  private uncertain(id: string, state: 'CREATE_UNKNOWN' | 'CHECKING', message: string) {
    return this.store.tx(() => {
      const p = this.require(id);
      if (p.state === 'CAPTURED') return p;
      p.state = state;
      p.error = message;
      this.store.save(p);
      this.store.event(id, 'gateway', state, { message });
      return p;
    });
  }
  async capture(id: string, orderId: string) {
    this.store.expire();
    const saved = this.require(id);
    ensure(
      saved.orderId === orderId,
      409,
      'ORDER_MISMATCH',
      'The callback order ID does not match the saved request.',
    );
    if (['CAPTURED', 'CAPTURING', 'CHECKING'].includes(saved.state)) return saved;
    ensure(saved.state === 'CHECKOUT', 409, 'NOT_CHECKOUT', 'This request cannot be captured.');
    const order = await this.provider.read(orderId);
    verifyOrder(order, saved, this.provider.merchantId);
    // A previous response may have been lost. Observe it before considering a mutation.
    if (order.purchase_units[0].payments?.captures?.length)
      return this.applyEvidence(saved.id, order);
    ensure(
      order.status === 'APPROVED',
      409,
      'BUYER_CONSENT_REQUIRED',
      'Buyer approval at PayPal is still required.',
    );
    const claim = this.store.tx(() => {
      const p = this.require(id);
      if (['CAPTURED', 'CAPTURING', 'CHECKING'].includes(p.state)) return { p, key: null };
      ensure(p.state === 'CHECKOUT', 409, 'NOT_CHECKOUT', 'This request cannot be captured.');
      this.preflight(p);
      ensure(
        !this.store.operation(id, 'capture'),
        409,
        'CAPTURE_EXISTS',
        'Reconcile the existing capture operation.',
      );
      const key = this.store.createOperation(id, 'capture');
      p.state = 'CAPTURING';
      this.store.save(p);
      this.store.event(id, 'owner', 'CAPTURE_CLAIMED', { operationId: key, orderId });
      return { p, key };
    });
    if (!claim.key) return claim.p;
    try {
      return this.applyEvidence(id, await this.provider.capture(orderId, claim.key));
    } catch {
      return this.uncertain(
        id,
        'CHECKING',
        'Checking payment. Your budget reservation remains in place. Refresh provider state.',
      );
    }
  }
  private applyEvidence(id: string, order: ProviderOrder) {
    return this.store.tx(() => {
      const p = this.require(id);
      const unit = verifyOrder(order, p, this.provider.merchantId);
      const captures = unit.payments?.captures ?? [];
      ensure(
        captures.length <= 1,
        502,
        'CAPTURE_COUNT',
        'Unexpected capture count. Manual provider inspection is required.',
      );
      const capture = captures[0];
      if (capture)
        ensure(
          capture.id && cents(capture.amount) === p.amountCents,
          502,
          'CAPTURE_AMOUNT',
          'Capture gross amount does not match the frozen basket.',
        );
      if (p.state === 'CAPTURED') {
        ensure(
          capture?.status === 'COMPLETED' && capture.id === p.captureId,
          502,
          'CAPTURE_CHANGED',
          'Provider capture evidence changed.',
        );
        return p;
      }
      const reservation = this.store.reservation(id);
      if (capture?.status === 'COMPLETED') {
        ensure(
          reservation?.state === 'active' && this.store.operation(id, 'capture'),
          409,
          'UNEXPECTED_CAPTURE',
          'A completed capture lacks its saved reservation or operation. Manual inspection is required.',
        );
        p.state = 'CAPTURED';
        p.captureId = capture.id;
        p.error = null;
        this.store.db
          .prepare(
            "UPDATE reservations SET state='committed' WHERE request_id=? AND state='active'",
          )
          .run(id);
        this.store.finishOperation(id, 'capture', 'completed');
        this.store.event(id, 'paypal', 'PAYMENT_COMPLETED', {
          orderId: p.orderId,
          captureId: capture.id,
          amountCents: p.amountCents,
        });
      } else if (
        capture?.status === 'DECLINED' ||
        capture?.status === 'FAILED' ||
        order.status === 'VOIDED'
      ) {
        if (reservation?.state === 'active') this.store.release(id);
        p.state = 'FAILED';
        p.error = 'Provider confirmed this payment did not complete.';
        this.store.finishOperation(id, 'capture', 'failed');
        this.store.event(id, 'paypal', 'PAYMENT_FAILED');
      } else if (this.store.operation(id, 'capture')) {
        p.state = 'CHECKING';
        p.error = 'Checking payment. Your budget reservation remains in place.';
      }
      this.store.save(p);
      return p;
    });
  }
  async reconcile(id: string) {
    const p = this.require(id);
    if (p.state === 'CREATING_ORDER' || p.state === 'CAPTURING') return p;
    if (!p.orderId && p.state === 'CREATE_UNKNOWN') {
      const op = this.store.operation(id, 'create');
      ensure(
        op && Date.now() - Date.parse(String(op.started_at)) < 5 * 60 * 1000,
        409,
        'INSPECTION_REQUIRED',
        'The bounded create recovery window elapsed. Inspect the saved operation in PayPal; do not create a new order.',
      );
      // Claim the same operation so concurrent refreshes cannot send competing retries.
      const claimed = this.store.tx(() => {
        const current = this.require(id);
        if (current.state !== 'CREATE_UNKNOWN') return false;
        current.state = 'CREATING_ORDER';
        this.store.save(current);
        return true;
      });
      if (!claimed) return this.require(id);
      return this.performCreate(p, String(op.operation_id));
    }
    ensure(p.orderId, 409, 'NO_ORDER', 'There is no saved PayPal order to refresh.');
    try {
      const order = await this.provider.read(p.orderId);
      const result = this.applyEvidence(id, order);
      this.store.event(id, 'owner', 'PROVIDER_REFRESHED', {
        orderId: p.orderId,
        providerStatus: order.status,
      });
      this.store.expire();
      return this.require(result.id);
    } catch (error) {
      if (['CHECKING', 'CAPTURING'].includes(p.state))
        return this.uncertain(
          id,
          'CHECKING',
          'Provider state could not be verified. Your budget reservation remains in place.',
        );
      throw error;
    }
  }
  cancel(id: string) {
    return this.store.tx(() => {
      const p = this.require(id);
      ensure(
        ['READY', 'REVIEW', 'CHECKOUT', 'CANCELLED'].includes(p.state),
        409,
        'PAYMENT_IN_FLIGHT',
        'An in-flight or uncertain operation must be reconciled before releasing budget.',
      );
      if (p.state !== 'CANCELLED') {
        p.state = 'CANCELLED';
        this.store.release(id);
        this.store.save(p);
        this.store.event(id, 'owner', 'BUYER_CANCELLED');
      }
      return p;
    });
  }
}
