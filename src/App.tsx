import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronRight,
  CircleAlert,
  Clock3,
  Coffee,
  Download,
  ExternalLink,
  FileCheck2,
  Gift,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Package,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { api, ApiError, setCsrf } from './api.js';
import type {
  Dashboard,
  Product,
  Purchase,
  PurchaseState,
  Selection,
  PlanRecord,
  Mandate,
} from '../shared/types.js';

const money = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const when = (at: string) =>
  new Date(at).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
const labels: Record<PurchaseState, string> = {
  BLOCKED: 'Blocked',
  REVIEW: 'Needs review',
  READY: 'Policy allowed',
  CREATING_ORDER: 'Preparing checkout',
  CREATE_UNKNOWN: 'Checking order',
  CHECKOUT: 'Awaiting buyer',
  CAPTURING: 'Payment in flight',
  CHECKING: 'Checking payment',
  CAPTURED: 'Payment completed',
  REJECTED: 'Rejected',
  EXPIRED: 'Expired',
  REVOKED: 'Revoked',
  CANCELLED: 'Cancelled',
  FAILED: 'Payment failed',
};
type Health = {
  ok: boolean;
  mode: string;
  ownerConfigured: boolean;
  agentConfigured: boolean;
  paypalConfigured: boolean;
  plannerConfigured: boolean;
  model: string;
};
type View = 'overview' | 'purchase' | 'mandate';
function Badge({ state }: { state: PurchaseState }) {
  return (
    <span
      className={`badge ${['READY', 'CAPTURED'].includes(state) ? 'green' : ['REVIEW', 'CHECKING', 'CREATE_UNKNOWN', 'CAPTURING', 'CREATING_ORDER', 'CHECKOUT'].includes(state) ? 'amber' : ['BLOCKED', 'FAILED', 'REJECTED', 'REVOKED'].includes(state) ? 'red' : 'neutral'}`}
    >
      <span className="status-dot" />
      {labels[state]}
    </span>
  );
}
function ProductIcon({ category }: { category: string }) {
  const Icon =
    category === 'kitchen'
      ? Coffee
      : category === 'gifts'
        ? Gift
        : category === 'electrical'
          ? Zap
          : Package;
  return (
    <span className={`product-icon ${category}`}>
      <Icon size={21} strokeWidth={1.6} />
    </span>
  );
}
function Empty({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function Login({ health, onLogin }: { health: Health | null; onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function login(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api<{ csrfToken: string }>('/session', { password });
      setCsrf(result.csrfToken);
      onLogin();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <div className="login-brand">
        <span className="brand-mark">
          <ShieldCheck size={24} />
        </span>
        mandate<span className="lite-label">LITE</span>
      </div>
      <div className="login-content">
        <div className="login-intro">
          <span className="eyebrow">A LITTLE AUTONOMY. CLEAR BOUNDARIES.</span>
          <h1>
            Let your agent plan.
            <br />
            <span>Keep permission yours.</span>
          </h1>
          <p>
            One place to set spending limits, review purchases, and see what actually happened at
            checkout.
          </p>
          <div className="login-principles">
            <span>
              <ShieldCheck size={18} />
              Permission before payment
            </span>
            <span>
              <FileCheck2 size={18} />
              Every decision, on record
            </span>
          </div>
          <div className="login-flow">
            <span>Agent proposes</span>
            <ChevronRight size={18} />
            <span>Mandate checks</span>
            <ChevronRight size={18} />
            <span>Buyer consents</span>
          </div>
        </div>
        <form className="login-card" onSubmit={login}>
          <span className="icon-box">
            <LockKeyhole size={23} />
          </span>
          <h2>Your owner workspace</h2>
          <p>Sign in to manage your pilot mandate.</p>
          {health && !health.ownerConfigured && (
            <div className="notice">
              Owner access is locked. Set <code>OWNER_PASSWORD</code> in your local{' '}
              <code>.env</code> file and restart the app.
            </div>
          )}
          <label htmlFor="password">Owner password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="Enter your owner password"
          />
          {error && (
            <div role="alert" className="error-text">
              {error}
            </div>
          )}
          <button className="primary full" disabled={busy || !health?.ownerConfigured}>
            {busy ? 'Signing in…' : 'Open workspace'}
            <ArrowRight size={17} />
          </button>
          <div className="login-foot">
            <span className="status-dot" />
            Sandbox workspace · USD only
          </div>
        </form>
      </div>
      <footer className="login-footer">
        MANDATE LITE <span>AI-assisted purchasing. Explicit human permission.</span>
      </footer>
    </div>
  );
}
export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [view, setView] = useState<View>('overview');
  const [data, setData] = useState<Dashboard | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const callbackHandled = useRef(false);
  const refresh = useCallback(async () => {
    const [dashboard, catalog, health] = await Promise.all([
      api<Dashboard>('/dashboard'),
      api<Product[]>('/catalog'),
      api<Health>('/health'),
    ]);
    setData(dashboard);
    setProducts(catalog);
    setHealth(health);
  }, []);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setHealth(await api<Health>('/health'));
        const session = await api<{ csrfToken: string }>('/session');
        if (cancelled) return;
        setCsrf(session.csrfToken);
        setLoggedIn(true);
        await refresh();
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 401)) setError((e as Error).message);
      } finally {
        if (!cancelled) setInitializing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);
  useEffect(() => {
    if (!loggedIn) return;
    const timer = setInterval(() => {
      refresh().catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
  }, [loggedIn, refresh]);
  useEffect(() => {
    if (!loggedIn || callbackHandled.current || !location.pathname.startsWith('/checkout/')) return;
    callbackHandled.current = true;
    const params = new URLSearchParams(location.search);
    const id = params.get('request');
    if (id) setSelectedId(id);
    setToast(
      location.pathname.endsWith('/cancel')
        ? 'Buyer returned from cancellation. Close the request below to release the reservation.'
        : 'Buyer returned from PayPal. Verify and capture below; returning alone is not payment confirmation.',
    );
  }, [loggedIn]);
  async function act(task: () => Promise<unknown>, message?: string) {
    setBusy(true);
    setError('');
    try {
      await task();
      await refresh();
      if (message) setToast(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function signedIn() {
    setLoggedIn(true);
    await refresh();
  }
  if (initializing)
    return (
      <div className="initial-loading">
        <ShieldCheck size={30} />
        <p>Opening your workspace…</p>
      </div>
    );
  if (!loggedIn)
    return (
      <>
        <Login
          health={health}
          onLogin={() => {
            signedIn().catch((e) => setError(e.message));
          }}
        />
        {error && (
          <div className="global-error" role="alert">
            {error}
          </div>
        )}
      </>
    );
  if (!data)
    return (
      <div className="initial-loading">
        <p>{error || 'Loading your workspace…'}</p>
        <button onClick={() => refresh().catch((e) => setError(e.message))}>Retry</button>
      </div>
    );
  const reviews = data.purchases.filter((p) => p.state === 'REVIEW');
  const m = data.mandate;
  const usedPercent = m
    ? Math.min(100, ((data.budget.spentCents + data.budget.reservedCents) / m.budgetCents) * 100)
    : 0;
  const rows = data.purchases.filter(
    (p) =>
      (filter === 'all' || filter === p.state) &&
      `${p.title} ${p.id} ${p.state}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            setView('overview');
          }}
        >
          <span className="brand-mark">
            <ShieldCheck size={22} />
          </span>
          mandate<span className="lite-label">LITE</span>
        </a>
        <div className="workspace-switch">
          <span className="workspace-logo">S</span>
          <div>
            <strong>Studio workspace</strong>
            <small>Purchasing pilot</small>
          </div>
          <LockKeyhole size={14} />
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {(
            [
              { id: 'overview', label: 'Overview', icon: LayoutDashboard },
              { id: 'purchase', label: 'Purchase desk', icon: ShoppingBag },
              { id: 'mandate', label: 'Spending mandate', icon: ShieldCheck },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              className={view === item.id ? 'nav-item active' : 'nav-item'}
              onClick={() => setView(item.id)}
            >
              <item.icon size={19} />
              {item.label}
              {item.id === 'overview' && reviews.length > 0 && (
                <span className="nav-count">{reviews.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="boundary-card">
            <ShieldCheck size={21} />
            <strong>Permission is explicit.</strong>
            <p>Your agent can propose a basket. Your mandate controls what happens next.</p>
            <span>One merchant · USD only</span>
          </div>
          <button
            className="profile"
            onClick={() =>
              act(async () => {
                await api('/session', undefined, 'DELETE');
                setLoggedIn(false);
                setCsrf('');
              })
            }
          >
            <span className="avatar">OW</span>
            <span>
              <strong>Workspace owner</strong>
              <small>Owner session</small>
            </span>
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <span>
              {view === 'overview'
                ? 'Overview'
                : view === 'purchase'
                  ? 'Purchase desk'
                  : 'Spending mandate'}
            </span>
          </div>
          <div className="topbar-right">
            <span className="sandbox-pill">
              <span className="status-dot" />
              Sandbox
            </span>
            <span className="divider" />
            <span className="avatar small">OW</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <span className="eyebrow">CONTROLLED COMMERCE</span>
              <h1>
                {view === 'overview'
                  ? 'Your purchasing, under control.'
                  : view === 'purchase'
                    ? 'A need. A basket. A clear decision.'
                    : 'Set the boundaries once.'}
              </h1>
              <p>
                {view === 'overview'
                  ? 'A clear view of your budget, approvals, and every purchasing decision.'
                  : view === 'purchase'
                    ? 'Let AI prepare a catalog basket, then put it through your spending rules.'
                    : 'Your agent gets useful freedom. You keep the final say on spending.'}
              </p>
            </div>
            {view === 'overview' && (
              <button className="primary" onClick={() => setView('purchase')}>
                <Plus size={18} />
                New purchase
              </button>
            )}
          </div>
          {error && (
            <div className="banner error" role="alert">
              <CircleAlert size={19} />
              <span>{error}</span>
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError('')}
              >
                <X size={17} />
              </button>
            </div>
          )}
          {toast && (
            <div className="banner info" role="status">
              <CircleAlert size={19} />
              <span>{toast}</span>
              <button
                className="icon-button"
                aria-label="Dismiss message"
                onClick={() => setToast('')}
              >
                <X size={17} />
              </button>
            </div>
          )}
          {view === 'overview' && (
            <>
              <section className="budget-strip" aria-label="Pilot budget">
                <div className="budget-main">
                  <div className="section-kicker">
                    <span className="icon-box small">
                      <ShieldCheck size={19} />
                    </span>
                    Pilot budget
                    {m && (
                      <span
                        className={`text-status ${m.revokedAt || m.expiresAt <= new Date().toISOString() ? 'red-text' : ''}`}
                      >
                        {m.revokedAt
                          ? 'Revoked'
                          : m.expiresAt <= new Date().toISOString()
                            ? 'Expired'
                            : 'Active mandate'}
                      </span>
                    )}
                  </div>
                  <div className="budget-value">
                    {money(m?.budgetCents ?? 0)}
                    <span>USD</span>
                  </div>
                  <div className="progress-track">
                    <div style={{ width: `${usedPercent}%` }} />
                  </div>
                  <p>
                    {m
                      ? 'One bounded pilot. No automatic resets.'
                      : 'Activate a mandate to start the pilot.'}
                  </p>
                </div>
                <BudgetStat
                  icon={<ArrowUpRight size={18} />}
                  label="Spent"
                  value={money(data.budget.spentCents)}
                  hint="Completed payments"
                />
                <BudgetStat
                  icon={<Clock3 size={18} />}
                  label="Reserved"
                  value={money(data.budget.reservedCents)}
                  hint="Held for active requests"
                />
                <BudgetStat
                  icon={<ArrowDownLeft size={18} />}
                  label="Available"
                  value={money(data.budget.availableCents)}
                  hint="Ready for new requests"
                  accent
                />
              </section>
              {!m && (
                <div className="activation-callout">
                  <span className="icon-box">
                    <SlidersHorizontal size={23} />
                  </span>
                  <div>
                    <h3>A clear mandate comes first.</h3>
                    <p>
                      Publish your budget, allowed categories, and review threshold to get started.
                    </p>
                  </div>
                  <button className="primary" onClick={() => setView('mandate')}>
                    Set up mandate
                    <ArrowRight size={17} />
                  </button>
                </div>
              )}
              <div className="overview-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <h2>
                      Needs your attention <span className="count">{reviews.length}</span>
                    </h2>
                    <span className="muted small-text">Owner review</span>
                  </div>
                  {reviews.length === 0 ? (
                    <Empty icon={<CheckCheck size={27} />} title="You're all caught up">
                      Purchases that need your permission will appear here. Your agent cannot
                      approve them.
                    </Empty>
                  ) : (
                    <div className="review-list">
                      {reviews.map((p) => (
                        <button
                          key={p.id}
                          className="review-row"
                          onClick={() => setSelectedId(p.id)}
                        >
                          <ProductIcon category={p.basket[0].category} />
                          <div>
                            <strong>{p.title}</strong>
                            <small>
                              {p.basket.length} catalog {p.basket.length === 1 ? 'item' : 'items'} ·
                              Expires {when(p.expiresAt)}
                            </small>
                          </div>
                          <strong className="review-amount">{money(p.amountCents)}</strong>
                          <ChevronRight size={18} />
                        </button>
                      ))}
                    </div>
                  )}
                </section>
                <section className="panel mandate-summary">
                  <div className="panel-heading">
                    <h2>Spending guardrails</h2>
                    <ShieldCheck size={20} />
                  </div>
                  <div className="guardrail-row">
                    <span>Per-order limit</span>
                    <strong>{m ? money(m.maxOrderCents) : '—'}</strong>
                  </div>
                  <div className="guardrail-row">
                    <span>Review above</span>
                    <strong>{m ? money(m.ownerReviewAboveCents) : '—'}</strong>
                  </div>
                  <div className="guardrail-row">
                    <span>Request lifetime</span>
                    <strong>15 minutes</strong>
                  </div>
                  <div className="category-tags">
                    {(m?.allowedCategories ?? ['kitchen', 'office', 'gifts']).map((c) => (
                      <span key={c}>{c}</span>
                    ))}
                  </div>
                  <button className="text-button" onClick={() => setView('mandate')}>
                    {m ? 'View published mandate' : 'Configure your mandate'}
                    <ArrowRight size={15} />
                  </button>
                </section>
              </div>
              <section className="panel activity-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Purchase activity</h2>
                    <p className="muted small-text">
                      From the first policy check to the final receipt.
                    </p>
                  </div>
                  <button
                    className="secondary compact"
                    onClick={() =>
                      act(async () => {
                        const record = await api('/audit');
                        const blob = new Blob([JSON.stringify(record, null, 2)], {
                          type: 'application/json',
                        });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'mandate-audit.json';
                        a.click();
                        setTimeout(() => URL.revokeObjectURL(url), 1000);
                      })
                    }
                  >
                    <Download size={15} />
                    Export audit
                  </button>
                </div>
                <div className="table-toolbar">
                  <div className="search-field">
                    <Search size={16} />
                    <input
                      aria-label="Search purchases"
                      placeholder="Search purchases…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                  <label className="filter">
                    <SlidersHorizontal size={15} />
                    <select
                      aria-label="Filter purchase status"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      <option value="all">All statuses</option>
                      {Object.entries(labels).map(([value, label]) => (
                        <option value={value} key={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {rows.length === 0 ? (
                  <Empty
                    icon={<ShoppingBag size={26} />}
                    title={
                      data.purchases.length
                        ? 'No matching purchases'
                        : 'Your first purchase starts here'
                    }
                  >
                    {data.purchases.length
                      ? 'Try another search or status.'
                      : 'Describe what your team needs in the purchase desk. Every request gets a policy decision before checkout.'}
                  </Empty>
                ) : (
                  <div className="purchase-table">
                    <div className="table-head">
                      <span>PURCHASE</span>
                      <span>POLICY / PAYMENT</span>
                      <span>AMOUNT</span>
                      <span>CREATED</span>
                      <span />
                    </div>
                    {rows.map((p) => (
                      <button className="table-row" key={p.id} onClick={() => setSelectedId(p.id)}>
                        <div className="purchase-name">
                          <ProductIcon category={p.basket[0].category} />
                          <div>
                            <strong>{p.title}</strong>
                            <small>
                              {p.source === 'model' ? 'AI planned' : 'Manual catalog'} ·{' '}
                              {p.id.slice(0, 8)}
                            </small>
                          </div>
                        </div>
                        <Badge state={p.state} />
                        <strong className="table-amount">{money(p.amountCents)}</strong>
                        <span className="table-date">{when(p.createdAt)}</span>
                        <ChevronRight size={17} />
                      </button>
                    ))}
                  </div>
                )}
                <div className="panel-foot">
                  <span>{data.purchases.length} purchase requests</span>
                  <span>
                    <LockKeyhole size={12} />
                    Server-verified amounts
                  </span>
                </div>
              </section>
              <IntegrationStatus health={health} />
            </>
          )}
          {view === 'purchase' && (
            <PurchaseDesk
              products={products}
              health={health}
              hasMandate={Boolean(m)}
              onSubmitted={(p) => {
                // The response already contains the persisted purchase. Seed the
                // drawer immediately while refreshing budget and audit state.
                setData((current) =>
                  current
                    ? {
                        ...current,
                        purchases: [p, ...current.purchases.filter((item) => item.id !== p.id)],
                      }
                    : current,
                );
                setSelectedId(p.id);
                refresh().catch((e) => setError(e.message));
              }}
              onError={setError}
            />
          )}
          {view === 'mandate' && (
            <MandateView
              mandate={m}
              busy={busy}
              onActivate={(input) =>
                act(
                  () => api('/mandate', input),
                  'Mandate activated. Its spending rules are now locked for this pilot.',
                )
              }
              onRevoke={() =>
                act(
                  () => api('/mandate/revoke', {}),
                  'Mandate revoked. In-flight payments remain reserved until verified.',
                )
              }
            />
          )}
          <footer className="main-footer">
            <span>
              <ShieldCheck size={14} />
              The agent proposes. Your mandate decides.
            </span>
            <span>Mandate Lite · Sandbox pilot</span>
          </footer>
        </main>
      </div>
      {selectedId && (
        <PurchaseDrawer
          id={selectedId}
          purchases={data.purchases}
          audit={data.audit}
          health={health}
          busy={busy}
          onClose={() => {
            setSelectedId(null);
            if (location.pathname.startsWith('/checkout/')) history.replaceState({}, '', '/');
          }}
          act={act}
        />
      )}
    </div>
  );
}
function BudgetStat({
  icon,
  label,
  value,
  hint,
  accent = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint: string;
  accent?: boolean;
}) {
  return (
    <div className={`budget-stat ${accent ? 'available' : ''}`}>
      <div className="stat-label">
        {icon}
        {label}
      </div>
      <strong>{value}</strong>
      <span>{hint}</span>
    </div>
  );
}
function IntegrationStatus({ health }: { health: Health | null }) {
  return (
    <div className="integration-status">
      <span className="small-text muted">CONNECTIONS</span>
      <span>
        <span className={`status-dot ${health?.paypalConfigured ? 'online' : 'offline'}`} />
        PayPal sandbox{' '}
        <small>
          {health?.paypalConfigured ? 'Configured · verification pending' : 'Not configured'}
        </small>
      </span>
      <span>
        <span className={`status-dot ${health?.plannerConfigured ? 'online' : 'offline'}`} />
        AI planner <small>{health?.plannerConfigured ? health.model : 'Not configured'}</small>
      </span>
    </div>
  );
}

function PurchaseDesk({
  products,
  health,
  hasMandate,
  onSubmitted,
  onError,
}: {
  products: Product[];
  health: Health | null;
  hasMandate: boolean;
  onSubmitted: (p: Purchase) => void;
  onError: (s: string) => void;
}) {
  const [need, setNeed] = useState('');
  const [plan, setPlan] = useState<PlanRecord | null>(null);
  const [items, setItems] = useState<Selection[]>([]);
  const [planning, setPlanning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);
  const keyRef = useRef<{ body: string; key: string } | null>(null);
  async function makePlan(e: FormEvent) {
    e.preventDefault();
    setPlanning(true);
    onError('');
    try {
      const record = await api<PlanRecord>('/plans', { need });
      setPlan(record);
      setItems(record.output.kind === 'basket' ? record.output.items : []);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setPlanning(false);
    }
  }
  function changeItem(sku: string, quantity: number) {
    setPlan(null);
    setItems((current) => [
      ...current.filter((i) => i.sku !== sku),
      ...(quantity > 0 ? [{ sku, quantity }] : []),
    ]);
  }
  async function submitBasket() {
    setSubmitting(true);
    onError('');
    const body = {
      title: (plan?.output.kind === 'basket'
        ? plan.output.summary
        : need || 'Manual catalog purchase'
      ).slice(0, 160),
      currency: 'USD',
      items,
      ...(plan?.output.kind === 'basket' ? { planId: plan.id } : {}),
    };
    const serialized = JSON.stringify(body);
    if (keyRef.current?.body !== serialized)
      keyRef.current = { body: serialized, key: crypto.randomUUID() };
    try {
      const p = await api<Purchase>('/intents', body, 'POST', {
        'Idempotency-Key': keyRef.current.key,
      });
      onSubmitted(p);
      setItems([]);
      setPlan(null);
      setNeed('');
      keyRef.current = null;
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }
  const amount = items.reduce(
    (sum, i) => sum + (products.find((p) => p.sku === i.sku)?.unitCents ?? 0) * i.quantity,
    0,
  );
  return (
    <>
      <div className="desk-grid">
        <section className="panel desk-input">
          <div className="panel-heading">
            <h2>
              <Sparkles size={19} />
              What does your team need?
            </h2>
            <span className="mini-label">CATALOG-GROUNDED AI</span>
          </div>
          <form onSubmit={makePlan}>
            <label className="sr-only" htmlFor="need">
              Purchasing need
            </label>
            <textarea
              id="need"
              maxLength={2000}
              minLength={5}
              rows={6}
              placeholder="We have six new starters. Pick reusable desk supplies under $80; avoid electrical items."
              value={need}
              onChange={(e) => {
                setNeed(e.target.value);
                setPlan(null);
              }}
              required
            />
            <div className="prompt-examples">
              <span>Try a scenario</span>
              {[
                { label: 'Coffee restock', text: 'Restock one 500 g bag of studio blend coffee.' },
                { label: 'Team gift', text: 'Choose one $180 celebration hamper for six people.' },
                {
                  label: 'New starters',
                  text: 'We have six new starters. Choose one reusable pen set per person under $80; avoid electrical items.',
                },
              ].map((p) => (
                <button
                  type="button"
                  key={p.label}
                  onClick={() => {
                    setNeed(p.text);
                    setPlan(null);
                  }}
                >
                  {p.label}
                  <ArrowUpRight size={12} />
                </button>
              ))}
            </div>
            {!health?.plannerConfigured && (
              <div className="notice">
                <CircleAlert size={17} />
                <span>
                  The AI planner needs a model API key. You can select catalog items manually below.
                </span>
              </div>
            )}
            <button
              className="primary"
              disabled={planning || !health?.plannerConfigured || need.trim().length < 5}
            >
              <Sparkles size={16} />
              {planning ? 'Preparing your basket…' : 'Plan a basket'}
            </button>
          </form>
          {plan && (
            <div
              className={`plan-result ${plan.output.kind === 'clarification' ? 'clarification' : ''}`}
            >
              <span className="eyebrow">
                {plan.output.kind === 'clarification'
                  ? 'A DETAIL TO CLARIFY'
                  : 'PLANNER SUGGESTION'}
              </span>
              <p>{plan.output.kind === 'basket' ? plan.output.summary : plan.output.question}</p>
              <small>
                {plan.provider} · {plan.model} · {plan.templateVersion}
              </small>
            </div>
          )}
          <div className="manual-toggle">
            <button className="text-button" onClick={() => setShowCatalog(!showCatalog)}>
              <Package size={16} />
              {showCatalog ? 'Hide manual catalog' : 'Select from catalog manually'}
              <ChevronRight size={15} />
            </button>
            <small>Manual selections are labelled in the audit.</small>
          </div>
        </section>
        <section className="panel basket-panel">
          <div className="panel-heading">
            <h2>Proposed basket</h2>
            <span className="count">{items.length}</span>
          </div>
          {items.length === 0 ? (
            <Empty icon={<ShoppingBag size={28} />} title="A thoughtful starting point">
              Plan a basket or select catalog items. The server checks every request against your
              mandate.
            </Empty>
          ) : (
            <>
              <div className="basket-lines">
                {items.map((i) => {
                  const p = products.find((p) => p.sku === i.sku)!;
                  return (
                    <div className="basket-line" key={i.sku}>
                      <ProductIcon category={p.category} />
                      <div>
                        <strong>{p.name}</strong>
                        <small>
                          {money(p.unitCents)} each · {p.category}
                        </small>
                      </div>
                      <label>
                        <span className="sr-only">Quantity for {p.name}</span>
                        <input
                          aria-label={`Quantity for ${p.name}`}
                          type="number"
                          min={0}
                          max={20}
                          value={i.quantity}
                          onChange={(e) =>
                            changeItem(
                              i.sku,
                              Math.max(0, Math.min(20, Math.trunc(Number(e.target.value)))),
                            )
                          }
                        />
                      </label>
                      <strong>{money(p.unitCents * i.quantity)}</strong>
                      <button
                        className="icon-button"
                        aria-label={`Remove ${p.name}`}
                        onClick={() => changeItem(i.sku, 0)}
                      >
                        <X size={15} />
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="basket-totals">
                <div>
                  <span>Pickup / shipping</span>
                  <span>{money(0)}</span>
                </div>
                <div>
                  <span>Sandbox fixture tax</span>
                  <span>{money(0)}</span>
                </div>
                <div className="total">
                  <strong>Basket total</strong>
                  <strong>
                    {money(amount)} <small>USD</small>
                  </strong>
                </div>
              </div>
              <p className="basket-disclosure">
                Fixed sandbox catalog. Pickup, zero shipping, and zero tax are demo fixtures. The
                server freezes and verifies the final total.
              </p>
              <button
                className="primary full"
                disabled={submitting || !hasMandate}
                onClick={submitBasket}
              >
                <ShieldCheck size={17} />
                {submitting ? 'Checking mandate…' : 'Check against mandate'}
                <ArrowRight size={16} />
              </button>
              <small className="under-button">
                {hasMandate
                  ? 'This checks permission. It does not make a payment.'
                  : 'Activate a spending mandate first.'}
              </small>
            </>
          )}
        </section>
      </div>
      {showCatalog && (
        <section className="panel catalog-panel">
          <div className="panel-heading">
            <div>
              <h2>The studio catalog</h2>
              <p className="muted small-text">
                Fixed merchant prices · {products.length} products · USD only
              </p>
            </div>
            <span className="mini-label">MANUAL SELECTION</span>
          </div>
          <div className="catalog-grid">
            {products.map((p) => {
              const quantity = items.find((i) => i.sku === p.sku)?.quantity ?? 0;
              return (
                <article className="catalog-product" key={p.sku}>
                  <div className="catalog-product-top">
                    <ProductIcon category={p.category} />
                    <span className="category-label">{p.category}</span>
                  </div>
                  <h3>{p.name}</h3>
                  <p>{p.attributes.join(' · ')}</p>
                  <div className="catalog-product-bottom">
                    <strong>{money(p.unitCents)}</strong>
                    <button
                      className="secondary compact"
                      disabled={quantity >= 20 || (items.length >= 10 && quantity === 0)}
                      onClick={() => changeItem(p.sku, quantity + 1)}
                    >
                      <Plus size={14} />
                      {quantity ? `Add (${quantity})` : 'Add'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
      <div className="desk-note">
        <ShieldCheck size={18} />
        <p>
          AI selects products, never payment authority. Forbidden categories and spending limits
          cannot be overridden by model output or owner approval.
        </p>
      </div>
    </>
  );
}

function MandateView({
  mandate,
  busy,
  onActivate,
  onRevoke,
}: {
  mandate: Mandate | null;
  busy: boolean;
  onActivate: (input: unknown) => void;
  onRevoke: () => void;
}) {
  const [budget, setBudget] = useState('400.00');
  const [cap, setCap] = useState('200.00');
  const [threshold, setThreshold] = useState('150.00');
  const [categories, setCategories] = useState(['kitchen', 'office', 'gifts']);
  const [expiry, setExpiry] = useState(() => {
    const d = new Date(Date.now() + 7 * 86400000);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const toCents = (value: string) => {
    if (!/^\d+(\.\d{1,2})?$/.test(value)) return NaN;
    const [d, f = ''] = value.split('.');
    return Number(d) * 100 + Number(f.padEnd(2, '0'));
  };
  const valid =
    toCents(budget) >= toCents(cap) &&
    toCents(cap) >= toCents(threshold) &&
    toCents(cap) > 0 &&
    categories.length > 0 &&
    Date.parse(expiry) > Date.now();
  return (
    <div className="mandate-grid">
      <section className="panel mandate-form">
        <div className="panel-heading">
          <h2>{mandate ? 'Published spending mandate' : 'Your pilot mandate'}</h2>
          {mandate && (
            <span className="badge neutral">
              <LockKeyhole size={12} />
              Version {mandate.version} · Locked
            </span>
          )}
        </div>
        {mandate ? (
          <>
            <div className="notice">
              <LockKeyhole size={18} />
              <span>
                This mandate was activated {when(mandate.activatedAt)}. Rules are fixed for the
                pilot; you can revoke future permission.
              </span>
            </div>
            <dl className="mandate-details">
              <div>
                <dt>Pilot budget</dt>
                <dd>{money(mandate.budgetCents)}</dd>
              </div>
              <div>
                <dt>Maximum per order</dt>
                <dd>{money(mandate.maxOrderCents)}</dd>
              </div>
              <div>
                <dt>Owner review above</dt>
                <dd>{money(mandate.ownerReviewAboveCents)}</dd>
              </div>
              <div>
                <dt>Currency</dt>
                <dd>USD</dd>
              </div>
              <div>
                <dt>Expires</dt>
                <dd>{when(mandate.expiresAt)}</dd>
              </div>
              <div>
                <dt>Allowed categories</dt>
                <dd>{mandate.allowedCategories.join(', ')}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  {mandate.revokedAt
                    ? `Revoked ${when(mandate.revokedAt)}`
                    : mandate.expiresAt <= new Date().toISOString()
                      ? 'Expired'
                      : 'Active'}
                </dd>
              </div>
            </dl>
            {!mandate.revokedAt && (
              <div className="revoke-section">
                <h3>Revoke spending permission</h3>
                <p>
                  Stops future capture attempts. Any payment already in flight stays reserved until
                  PayPal confirms the outcome.
                </p>
                {confirmRevoke ? (
                  <div className="button-row">
                    <button disabled={busy} className="danger" onClick={onRevoke}>
                      Confirm revocation
                    </button>
                    <button className="secondary" onClick={() => setConfirmRevoke(false)}>
                      Keep active
                    </button>
                  </div>
                ) : (
                  <button className="danger" onClick={() => setConfirmRevoke(true)}>
                    Revoke mandate
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (valid)
                onActivate({
                  budgetCents: toCents(budget),
                  maxOrderCents: toCents(cap),
                  ownerReviewAboveCents: toCents(threshold),
                  allowedCategories: categories,
                  expiresAt: new Date(expiry).toISOString(),
                });
            }}
          >
            <div className="form-field">
              <label htmlFor="budget">
                Total pilot budget <span>USD</span>
              </label>
              <input
                id="budget"
                inputMode="decimal"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                required
              />
              <small>A bounded allowance, with no recurring reset.</small>
            </div>
            <div className="form-columns">
              <div className="form-field">
                <label htmlFor="cap">Per-order maximum</label>
                <input
                  id="cap"
                  inputMode="decimal"
                  value={cap}
                  onChange={(e) => setCap(e.target.value)}
                  required
                />
              </div>
              <div className="form-field">
                <label htmlFor="threshold">Owner review above</label>
                <input
                  id="threshold"
                  inputMode="decimal"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  required
                />
              </div>
            </div>
            <fieldset>
              <legend>Allowed categories</legend>
              <div className="category-options">
                {['kitchen', 'office', 'gifts', 'electrical'].map((c) => (
                  <label key={c}>
                    <input
                      type="checkbox"
                      checked={categories.includes(c)}
                      onChange={() =>
                        setCategories((v) => (v.includes(c) ? v.filter((x) => x !== c) : [...v, c]))
                      }
                    />
                    {c}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="form-field">
              <label htmlFor="expiry">
                Mandate expiry <span>Local time</span>
              </label>
              <input
                id="expiry"
                type="datetime-local"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                required
              />
            </div>
            <div className="notice">
              <LockKeyhole size={18} />
              <span>
                Activation locks these rules for this pilot. Review threshold ≤ per-order maximum ≤
                total budget.
              </span>
            </div>
            <button className="primary" disabled={!valid || busy}>
              <ShieldCheck size={17} />
              {busy ? 'Activating…' : 'Activate mandate'}
            </button>
          </form>
        )}
      </section>
      <aside className="mandate-explainer">
        <span className="icon-box">
          <ShieldCheck size={25} />
        </span>
        <h2>
          Clear rules.
          <br />
          Predictable decisions.
        </h2>
        <p>Every basket follows the same path, before a payment order can exist.</p>
        {[
          {
            number: '01',
            title: 'Check the hard rules',
            text: 'Active mandate, allowed categories, and the whole-basket order cap.',
          },
          {
            number: '02',
            title: 'Reserve the budget',
            text: 'Spent plus active reservations must stay within your total pilot budget.',
          },
          {
            number: '03',
            title: 'Get permission',
            text: 'Above your threshold, only the owner can approve the exact frozen basket.',
          },
          {
            number: '04',
            title: 'Let the buyer consent',
            text: 'PayPal buyer consent is separate from internal spending permission.',
          },
        ].map((s) => (
          <div className="explain-step" key={s.number}>
            <span>{s.number}</span>
            <div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          </div>
        ))}
      </aside>
    </div>
  );
}

function PurchaseDrawer({
  id,
  purchases,
  audit,
  health,
  busy,
  onClose,
  act,
}: {
  id: string;
  purchases: Purchase[];
  audit: Dashboard['audit'];
  health: Health | null;
  busy: boolean;
  onClose: () => void;
  act: (task: () => Promise<unknown>, message?: string) => Promise<void>;
}) {
  const [details, setDetails] = useState<{
    operations: { kind: string; operation_id: string; state: string }[];
    plan: PlanRecord | null;
  } | null>(null);
  const [detailError, setDetailError] = useState('');
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const p = purchases.find((p) => p.id === id);
  useEffect(() => {
    api<{
      operations: { kind: string; operation_id: string; state: string }[];
      plan: PlanRecord | null;
    }>(`/intents/${id}`)
      .then(setDetails)
      .catch((e) => setDetailError(e.message));
  }, [id, p?.state]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    closeButton.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function handle(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose();
      if (e.key === 'Tab') {
        const elements = dialog.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input,select,textarea,summary,[tabindex="0"]',
        );
        if (!elements?.length) return;
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', handle);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', handle);
      previous?.focus();
    };
  }, [onClose, busy]);
  const post = (action: string, body: unknown = {}, message?: string) =>
    act(() => api(`/intents/${id}/${action}`, body), message);
  return (
    <div
      className="drawer-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={dialog}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
      >
        <div className="drawer-header">
          <span className="eyebrow">PURCHASE DETAILS</span>
          <button
            ref={closeButton}
            className="icon-button"
            onClick={onClose}
            aria-label="Close purchase details"
          >
            <X size={21} />
          </button>
        </div>
        {!p ? (
          <div className="drawer-content">
            <h2 id="drawer-title">Request unavailable</h2>
            <p>{detailError || 'Refresh your workspace to load this request.'}</p>
          </div>
        ) : (
          <>
            <div className="drawer-content">
              <Badge state={p.state} />
              <h2 id="drawer-title">{p.title}</h2>
              <div className="receipt-amount">
                {money(p.amountCents)}
                <span>USD</span>
              </div>
              <p className="muted">
                {p.source === 'model' ? 'AI-planned basket' : 'Manual catalog selection'} ·{' '}
                {when(p.createdAt)}
              </p>
              {p.state === 'READY' && (
                <div className="notice success">
                  <ShieldCheck size={18} />
                  <span>
                    {p.approval
                      ? 'Owner approved. Buyer consent still needed.'
                      : 'Policy allowed. Buyer consent still needed.'}
                  </span>
                </div>
              )}
              {p.error && (
                <div className="notice">
                  <CircleAlert size={18} />
                  <span>{p.error}</span>
                </div>
              )}
              {p.state === 'CAPTURED' && (
                <div className="notice success">
                  <CheckCheck size={18} />
                  <span>
                    Sandbox payment completed. PayPal confirmed the saved capture and amount.
                  </span>
                </div>
              )}
              <h3 className="drawer-section-title">Frozen basket</h3>
              <div className="receipt-lines">
                {p.basket.map((line) => (
                  <div className="receipt-line" key={line.sku}>
                    <ProductIcon category={line.category} />
                    <div>
                      <strong>{line.name}</strong>
                      <small>
                        {line.quantity} × {money(line.unitCents)} · {line.sku}
                      </small>
                    </div>
                    <strong>{money(line.unitCents * line.quantity)}</strong>
                  </div>
                ))}
              </div>
              <div className="receipt-fixture">
                Pickup · $0 shipping · $0 tax (sandbox fixtures)
              </div>
              <h3 className="drawer-section-title">
                Policy decision <span>Mandate v{p.mandateVersion}</span>
              </h3>
              <div className="rule-list">
                {p.rules.map((rule) => (
                  <div
                    className={`rule ${rule.passed ? 'pass' : rule.id === 'OWNER_REVIEW' && p.decision === 'review' ? 'review' : 'fail'}`}
                    key={rule.id}
                  >
                    {rule.passed ? (
                      <Check size={16} />
                    ) : rule.id === 'OWNER_REVIEW' ? (
                      <Clock3 size={16} />
                    ) : (
                      <X size={16} />
                    )}
                    <div>
                      <strong>{rule.id.replaceAll('_', ' ')}</strong>
                      <p>{rule.message}</p>
                    </div>
                  </div>
                ))}
              </div>
              {p.approval && (
                <div className="approval-record">
                  <FileCheck2 size={18} />
                  <div>
                    <strong>Owner approval recorded</strong>
                    <p>
                      {when(p.approval.at)} · {money(p.approval.amountCents)} · Exact basket bound
                    </p>
                  </div>
                </div>
              )}
              <h3 className="drawer-section-title">Audit trail</h3>
              <ol className="timeline">
                {audit
                  .filter((e) => e.requestId === id)
                  .reverse()
                  .map((e) => (
                    <li key={e.id}>
                      <span className="timeline-dot" />
                      <div>
                        <strong>{e.type.toLowerCase().replaceAll('_', ' ')}</strong>
                        <small>
                          {e.actor} · {when(e.at)}
                        </small>
                      </div>
                    </li>
                  ))}
              </ol>
              <details className="technical-details">
                <summary>References &amp; verification</summary>
                <dl>
                  <dt>Request ID</dt>
                  <dd>{p.id}</dd>
                  <dt>Basket SHA-256</dt>
                  <dd>{p.basketHash}</dd>
                  <dt>Request expiry</dt>
                  <dd>{when(p.expiresAt)}</dd>
                  {p.orderId && (
                    <>
                      <dt>PayPal order ID</dt>
                      <dd>{p.orderId}</dd>
                    </>
                  )}
                  {p.captureId && (
                    <>
                      <dt>PayPal capture ID</dt>
                      <dd>{p.captureId}</dd>
                    </>
                  )}
                  {details?.operations.map((o) => (
                    <div key={o.kind}>
                      <dt>
                        {o.kind} operation · {o.state}
                      </dt>
                      <dd>{o.operation_id}</dd>
                    </div>
                  ))}
                  {details?.plan && (
                    <>
                      <dt>AI model / template</dt>
                      <dd>
                        {details.plan.model} · {details.plan.templateVersion}
                      </dd>
                      <dt>Structured plan output</dt>
                      <dd>
                        <pre>{JSON.stringify(details.plan.output, null, 2)}</pre>
                      </dd>
                    </>
                  )}
                </dl>
                {detailError && <p className="error-text">{detailError}</p>}
              </details>
            </div>
            <div className="drawer-actions">
              {p.state === 'REVIEW' && (
                <>
                  <p>
                    Review this exact basket before its expiry. This approval does not pay the
                    merchant.
                  </p>
                  <div className="button-row">
                    <button
                      disabled={busy}
                      className="primary"
                      onClick={() =>
                        post(
                          'decision',
                          { decision: 'approve', basketHash: p.basketHash },
                          'Owner approved. Buyer consent is still needed.',
                        )
                      }
                    >
                      <Check size={17} />
                      Approve {money(p.amountCents)}
                    </button>
                    <button
                      disabled={busy}
                      className="secondary"
                      onClick={() =>
                        post('decision', { decision: 'reject', basketHash: p.basketHash })
                      }
                    >
                      Reject
                    </button>
                  </div>
                </>
              )}
              {p.state === 'READY' && (
                <>
                  <button
                    disabled={busy || !health?.paypalConfigured}
                    className="primary full"
                    onClick={() =>
                      act(async () => {
                        const next = await api<Purchase>(`/intents/${id}/checkout`, {});
                        if (next.state === 'CHECKOUT' && next.checkoutUrl)
                          window.location.assign(next.checkoutUrl);
                      })
                    }
                  >
                    Continue to PayPal
                    <ExternalLink size={16} />
                  </button>
                  {!health?.paypalConfigured && (
                    <small className="under-button">
                      Connect the PayPal sandbox seller credentials to continue.
                    </small>
                  )}
                </>
              )}
              {p.state === 'CHECKOUT' && (
                <>
                  <p>Verify buyer consent at PayPal, then explicitly capture this frozen amount.</p>
                  <div className="button-row">
                    <button
                      disabled={busy}
                      className="primary"
                      onClick={() => post('capture', { orderId: p.orderId })}
                    >
                      Verify &amp; capture {money(p.amountCents)}
                    </button>
                    {p.checkoutUrl && (
                      <a className="secondary button-link" href={p.checkoutUrl}>
                        Open PayPal
                        <ExternalLink size={15} />
                      </a>
                    )}
                  </div>
                </>
              )}
              {['CHECKING', 'CREATE_UNKNOWN', 'CHECKOUT'].includes(p.state) && (
                <button
                  disabled={busy}
                  className="secondary full"
                  onClick={() => post('reconcile')}
                >
                  <RefreshCw size={16} />
                  {busy ? 'Checking…' : 'Refresh provider state'}
                </button>
              )}
              {['CAPTURING', 'CREATING_ORDER'].includes(p.state) && (
                <p className="inflight-copy">
                  <Clock3 size={17} />
                  Operation in flight. Keep the reservation until its outcome is verified.
                </p>
              )}
              {['READY', 'CHECKOUT'].includes(p.state) && (
                <button
                  disabled={busy}
                  className="text-button cancel-button"
                  onClick={() => post('cancel', {}, 'Request closed and its reservation released.')}
                >
                  Close without payment
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
