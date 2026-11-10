# PRD coverage

This separates code coverage from account-dependent acceptance. **Full PRD acceptance remains pending live PayPal and model execution.** The user chose to supply credentials later; that does not turn fixture tests into live evidence.

| Requirement               | Code and local verification                                                                                                                                                  | Remaining acceptance                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| FR-01 Activate mandate    | Immutable activation, thresholds/categories/expiry validation, revocation; unit + browser checks                                                                             | None specific to external services                            |
| FR-02 Plan basket         | OpenAI/Groq structured output, SKU/quantity validation, public preference evidence, bounded agent-scoped clarification context, saved provider/model/template; adapter tests | Five real contextual prompts and human review; actual latency |
| FR-03 Validate basket     | Server catalog, integer cents, strict fields, duplicate merging and limits; tamper tests                                                                                     | Reconfirm with live demo inputs                               |
| FR-04 Evaluate permission | Deterministic hard-rule precedence and machine-readable rules; boundary tests                                                                                                | None specific to external services                            |
| FR-05 Cumulative budget   | Serialized SQLite reservations; three-process contention test                                                                                                                | None specific to external services                            |
| FR-06 Review              | Bound approval tuple, persisted owner decision including rejection, exact release; tests + browser approval/rejection                                                        | Live checkout after owner decision                            |
| FR-07 Create checkout     | Owner-only route, durable create claim and key, one saved order, bounded same-key recovery, session binding; adapter/API tests                                               | Actual sandbox order creation                                 |
| FR-08 Buyer consent       | PayPal handoff, session/order-validated read-only return, explicit protected capture POST; no GET charge                                                                     | Real buyer consent and cancellation                           |
| FR-09 Capture             | Reservation/permission/approval preflight, saved order, payee/currency/gross checks, completed capture evidence; tests                                                       | Actual completed PayPal capture                               |
| FR-10 Uncertainty         | Pending/lost responses retain reservations, same saved operation; injected failure tests                                                                                     | Observe account/provider-specific behavior                    |
| FR-11 Reconcile           | Authenticated saved-order read; commit once after lost response/restart; tests                                                                                               | Reconcile actual saved sandbox order                          |
| FR-12 Expire/revoke       | 15-minute TTL, lazy/startup expiry, in-flight revocation boundary; tests                                                                                                     | Live checkout revocation rerun                                |
| FR-13 Audit               | Frozen basket/rules/owner decision/operation/provider references; API filters and JSON export; browser checks                                                                | Actual order/capture references                               |
| FR-14 Access              | Persisted single-workspace identities and hashes, active agent flag/revocation, versioned owner sessions, CSRF/origin/rate limits; HTTP + restart tests                      | Production HTTPS deployment only if hosting is chosen         |
| FR-15 Recovery            | SQLite ledger and operations persist; guarded duplicate claims and restart recovery; tests                                                                                   | Browser callback failure with real provider state             |

## P1 additions

- AG Grid Community desktop audit with per-column sorting/filtering and filtered CSV export. Formula-like CSV values are neutralized. Mobile uses request cards.
- A separate read-only fixture replay at `/replay`. Simulated selections and captures are labelled; it never calls the model or payment gateway or writes to the ledger.
- Downloadable JSON audit record, including filtered API access.

## Local delivery and checks

- Node version, lockfile, seed/migration, environment template, build/start instructions and MIT license are included.
- Desktop/mobile browser QA is recorded in [VISUAL_QA.md](VISUAL_QA.md).
- `npm run verify:fresh` creates an isolated source copy, runs `npm ci`, tests, build and seed, then verifies production HTTP, owner login and a manual policy request without external payment/model calls.
- `npm run benchmark` measures full local intent transactions, including reservations and lazy expiry. Measurement is machine-specific.
- `npm run evaluate:model` is opt-in and runs the five real model prompts after credentials are configured; it records timing/output and leaves human review pending.

## Outside code completion

G1 requires an actual seller/buyer account and model key. A real demo recording, its public video URL, judge-access instructions, user interviews and impact measurements require real execution or people. The submission draft labels these as pending. Hosting is optional under the PRD; no hosting or submission is claimed.

The PRD's excluded features remain excluded: unattended wallet spending, authorization holds, refunds UI, multi-merchant/currency, recurring resets, dynamic shipping/tax, webhooks, custom MCP and trained fraud models.
