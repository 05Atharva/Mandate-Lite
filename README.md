# Mandate Lite

Controlled checkout for an AI purchasing agent. The planner proposes catalog products; a deterministic server enforces a published spending mandate before PayPal sandbox checkout.

Implementation follows [the PRD](PayPal-Hackathon-Mandate-Lite-PRD.md). This is a single-workspace prototype with one merchant, owner and agent, and USD only. It does not grant unattended access to a buyer wallet.

## Development

Requires Node.js 24.14 or newer and npm.

```powershell
npm ci
Copy-Item .env.example .env
# Set distinct OWNER_PASSWORD and AGENT_API_KEY in .env.
npm run db:seed
npm run dev
```

Open http://localhost:3000. Configure PayPal sandbox seller client ID, secret and merchant ID, plus an OpenAI API key, to run the live integration gate. Credentials stay server-side. The app never substitutes simulated payment success or scripted AI output for missing credentials.

```powershell
npm run check
npm test
npm run build
npm start
```

The SQLite database is stored in `data/mandate.sqlite` by default. Seed is idempotent and preserves existing financial state. The active pilot mandate is immutable; revocation prevents future attempts. Uncertain external operations keep their reservation until reconciled.

## Using the prototype

1. Sign in using `OWNER_PASSWORD`. Open **Spending mandate** and activate the default $400 pilot, $200 order cap, and owner review above $150. Activation is one-time and locks the rules. The expiry field uses your browser's local time.
2. Open **Purchase desk**. Describe a need to call the real model, or choose **Select from catalog manually**. Manual baskets are labelled as manual in the audit.
3. Submit one coffee ($18), one celebration hamper ($180), or one espresso machine ($900) to exercise allow, review and block. Requests reserve budget for 15 minutes. Hard failures do not reserve budget or call PayPal.
4. Approve a review request from its details drawer. **Continue to PayPal** creates a saved sandbox order and hands off to the buyer. Use a sandbox buyer distinct from the seller.
5. After the buyer returns, choose **Verify & capture**. A return URL never charges by itself. The server verifies the saved order, amount, currency and merchant before claiming capture.
6. For an uncertain payment, choose **Refresh provider state**. It reads the saved order and commits a completed capture exactly once. Pending or unverified payments keep their reservation.

The overview shows spent, reserved and available funds, a review queue, searchable purchase activity and JSON audit export. **Advanced audit** opens AG Grid Community on desktop with sorting, column filters and filtered CSV export; mobile keeps the request cards. Formula-like CSV cells are neutralized. Request details include frozen prices, rule IDs, exact owner approval, operation IDs and provider references. There is no role-switch control granting permissions.

`/replay` provides a separate read-only walkthrough of clearly labelled simulated scenarios. It needs no credentials and never calls a provider or changes the ledger. Its fixture receipts are not live payment evidence.

## Credentials and integrations

Set long, distinct owner and agent credentials. For example, run this twice and use each output for a separate value in your untracked `.env`:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

| Variable                                   | Purpose                                                                    |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| `OWNER_PASSWORD`                           | Owner sign-in; salted scrypt comparison; eight-hour HTTP-only session      |
| `AGENT_API_KEY`                            | Agent bearer credential; proposal/planning access only                     |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | Sandbox seller REST application credentials                                |
| `PAYPAL_MERCHANT_ID`                       | Expected seller merchant/account ID; verified before capture               |
| `OPENAI_API_KEY`                           | OpenAI credential when `LLM_PROVIDER=openai`                               |
| `GROQ_API_KEY`                             | Groq credential when `LLM_PROVIDER=groq`                                   |
| `LLM_PROVIDER`, `LLM_MODEL`                | Provider and optional explicit model override                              |
| `OPENAI_MODEL`                             | Structured-output-capable model; defaults to `gpt-4.1-mini`                |
| `APP_URL`                                  | Exact public origin, without a path; local default `http://localhost:3000` |
| `DATABASE_PATH`                            | Persistent SQLite path, default `./data/mandate.sqlite`                    |
| `COOKIE_SECURE`                            | `true` for HTTPS deployments; required outside localhost                   |

Only PayPal's sandbox API is supported. No live-mode switch is present. Missing model configuration disables AI planning; missing seller configuration disables checkout. Configured is not the same as successfully verified. Do not place secrets in `VITE_` variables, screenshots, exported records, or commits.

Agent clients send `Authorization: Bearer <AGENT_API_KEY>`. `POST /api/intents` also requires an `Idempotency-Key` of 8–100 letters, numbers, underscores or hyphens. Example body:

```json
{
  "title": "Office coffee restock",
  "currency": "USD",
  "items": [{ "sku": "COFFEE-01", "quantity": 1 }]
}
```

`POST /api/plans` accepts `{ "need": "..." }`. To preserve AI provenance, submit its saved `planId` with the matching items. Modified selections must be submitted as manual. Agents cannot activate/revoke a mandate, approve, create checkout, capture, reconcile or read the owner audit.

For Groq, set these values in `.env`, keeping the key local:

```dotenv
LLM_PROVIDER=groq
GROQ_API_KEY=your-local-key
LLM_MODEL=openai/gpt-oss-20b
```

Groq uses its documented OpenAI-compatible Responses endpoint with strict Structured Outputs. OpenAI remains available by setting `LLM_PROVIDER=openai`. Each provider uses only its own credential; no automatic fallback sends requests to another provider. See [Groq Responses](https://console.groq.com/docs/responses-api) and [supported strict-output models](https://console.groq.com/docs/structured-outputs).

Planner baskets contain `userSummary`, `preferenceEvidence`, and catalog `items`. When a plan asks a clarification, send the answer as `need` with its `previousPlanId`; the server retains the original need/question, scopes it to the authenticated agent and bounds context to four clarification turns. The UI handles this exchange and can start a fresh need. Preference evidence is a public constraint-to-product explanation, not a private reasoning trace.

Owner/agent identities and hashed credentials are persisted in SQLite. Reusing the same configuration preserves sessions and revocations; configuring a different owner password invalidates old sessions. `POST /api/agent/revoke` disables agent access durably. To rotate and reactivate an agent, configure a different agent key and restart. Checkout returns and captures require the owner session that opened or explicitly resumed the saved order.

## Architecture and validation

React/Vite/TypeScript in `src/`, Express in `server/`, shared types in `shared/`. Express serves the production frontend in the same process. SQLite uses WAL, foreign keys, uniqueness constraints and `BEGIN IMMEDIATE` reservation transactions. The ledger and operation claims commit before external calls; no database lock waits on PayPal or the model.

Model selections use strict Structured Outputs and additional server validation. Client amounts/categories/approval flags are rejected. Owner mutations require both the application origin and a session CSRF token. Login, planning and API routes are rate-limited. Authentication and provider errors are sanitized.

`npm test` exercises policy boundaries, aggregation, tampering, HTTP credential separation/CSRF, actual multi-process reservation contention, duplicate claims, pending/declined/lost responses, revocation races and on-disk restart recovery. Payment tests use an explicit injected provider in an isolated database; the runtime has no fixture-payment mode.

Desktop and mobile owner flows were checked in the browser; see [the visual QA record](docs/VISUAL_QA.md) for the exercised cases and two fixes. Follow [the integration checklist](docs/INTEGRATION_CHECKLIST.md) for account-dependent acceptance. Real PayPal buyer consent/capture/cancel and five real model prompts remain required evidence. Automated adapter fixtures are not live evidence.

Additional checks:

```powershell
npm run verify:fresh
npm run benchmark
# Opt-in real provider calls; requires the chosen key and may incur charges:
npm run evaluate:model
```

The fresh-setup check uses an isolated copy under `.local/`, installs from the lockfile, runs tests/build/seed and verifies the production server, login and a manual policy request. It does not call model/payment providers. A 200-request local transaction benchmark measured p95 1.922 ms on the development machine; this is a local measurement, not a hosted performance guarantee. The model evaluation records outputs and latency for the five PRD prompts in untracked `data/model-evaluation.json`; human review remains required.

See [PRD coverage](docs/PRD_COVERAGE.md) and the [submission preparation draft](docs/SUBMISSION.md). Builds retain bundled browser dependency license notices at `dist/client/third-party-licenses.txt`; server/development dependencies retain their package licenses. AG Grid uses Community features only.

## Limits

This prototype governs this merchant integration, not purchases made elsewhere. The owner is the expense approver; the PayPal participant separately consents to pay. Sandbox pickup, zero shipping and zero tax are disclosed fixtures, not general store rules. Audit history is append-only through app routes, not tamper-proof against a database administrator.

Create timeouts permit bounded recovery using the original operation key for five minutes, within the documented standard provider retention window. After that, inspect the provider operation manually; the app does not guess or create a new order. Capture uncertainty is resolved by reads rather than blind recapture. A capture already claimed before revocation may still complete.

The immutable pilot has no replacement/reset UI, automatic monthly resets, refund handling, stock integration, webhooks or multi-tenant identity. Use a fresh separately named database for a separate isolated pilot; never delete an unresolved ledger to free budget.

The built-in Node SQLite API currently emits an experimental-feature warning. This prototype uses one server process and persistent local storage; do not deploy multiple replicas or place the ledger on an ephemeral disk.
