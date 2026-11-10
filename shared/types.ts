export type Category = 'kitchen' | 'office' | 'gifts' | 'electrical';
export interface Product { sku: string; name: string; category: Category; unitCents: number; attributes: string[]; version: number }
export interface Selection { sku: string; quantity: number }
export interface BasketLine extends Product { quantity: number }
export interface Mandate { id: string; version: number; currency: 'USD'; budgetCents: number; maxOrderCents: number; ownerReviewAboveCents: number; allowedCategories: Category[]; expiresAt: string; activatedAt: string; revokedAt: string | null; requestTtlSeconds: number }
export interface Rule { id: string; passed: boolean; message: string }
export type PurchaseState = 'BLOCKED' | 'REVIEW' | 'READY' | 'CREATING_ORDER' | 'CREATE_UNKNOWN' | 'CHECKOUT' | 'CAPTURING' | 'CHECKING' | 'CAPTURED' | 'REJECTED' | 'EXPIRED' | 'REVOKED' | 'CANCELLED' | 'FAILED';
export interface Approval { requestId: string; basketHash: string; amountCents: number; mandateVersion: number; expiresAt: string; actor: string; at: string }
export interface Purchase { id: string; agentId: string; title: string; source: 'manual' | 'model'; planId: string | null; basket: BasketLine[]; basketHash: string; amountCents: number; mandateVersion: number; rules: Rule[]; decision: 'allow' | 'review' | 'block'; state: PurchaseState; createdAt: string; expiresAt: string; approval: Approval | null; orderId: string | null; captureId: string | null; checkoutUrl: string | null; error: string | null }
export interface Budget { spentCents: number; reservedCents: number; availableCents: number }
export interface AuditEvent { id: number; requestId: string | null; actor: string; type: string; data: Record<string, unknown>; at: string }
export type Plan = { kind: 'basket'; summary: string; items: Selection[] } | { kind: 'clarification'; question: string };
export interface PlanRecord { id: string; output: Plan; provider: string; model: string; templateVersion: string; createdAt: string }
export interface Dashboard { mandate: Mandate | null; budget: Budget; purchases: Purchase[]; audit: AuditEvent[] }
