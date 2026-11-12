# Production-build integration testing — 11 November 2026

This is testing of the production build against **PayPal sandbox**, not real-money production payments or a deployed hosted environment. Buyer consent and completed capture have now been verified. Full live acceptance remains incomplete pending cancellation, additional recovery checks, and model explanation-quality acceptance.

## Environment

- `.env` is ignored by Git. Values were inspected through redacted structural checks, never printed.
- PayPal client ID/secret/merchant ID and the Groq key were populated. The owner password and agent API key were empty; distinct random 32-byte credentials were generated and saved locally in `.env`.
- Environment line endings were normalized and all required variables revalidated successfully.
- Provider is `groq`, model is `openai/gpt-oss-20b`, local origin is `http://localhost:3000`, and secure cookies are disabled for local HTTP. A public deployment would need its own HTTPS origin and secure cookies.
- Verification used Node 24.22.2 from isolated local tooling. The system default Node remains older than the documented runtime requirement.

## Build and regressions

- Production build and TypeScript checking passed.
- All 35 existing automated tests passed again after the planner change, including concurrency, persisted identity, CSRF, exact approval binding, provider uncertainty, and restart recovery.
- Vite still reports a large lazy AG Grid chunk. This is a build advisory, not a failed build.

## Actual Groq execution

An initial five-prompt evaluation established valid credentials but exposed an unsuitable response to a vague request and one transient failed request. The planner instructions were tightened and versioned as `catalog-planner-v3`: require clarification for under-specified purchasing needs, distinguish a mandate from the user's budget, and avoid implying unverifiable dietary suitability.

A paced five-scenario rerun returned the expected selection or clarification for all five prompts:

| Scenario                          | Actual outcome                                        | Time   |
| --------------------------------- | ----------------------------------------------------- | ------ |
| One 500 g coffee bag              | COFFEE-01 × 1                                         | 944 ms |
| Reusable pen set per six starters | PEN-01 × 6                                            | 663 ms |
| Celebration hamper for six        | GIFT-01 × 1                                           | 638 ms |
| Something nice for the team       | Clarification about headcount, budget and preferences | 619 ms |
| Nut-free hamper for six           | Clarification acknowledging no nut-free hamper        | 632 ms |

No provider HTTP errors occurred in that rerun. These are observed timings for five requests, not a reliability or performance guarantee.

**Remaining quality finding:** some public `preferenceEvidence` text is inaccurate even when the selections and totals are valid. One output described the $80 basket budget as per-person; another called unrequested catalog attributes “requirements.” The dietary clarification also suggested a custom alternative whose suitability would need verification. The schema and server policy remain authoritative, but explanation quality is not fully accepted. Human review of the saved outputs remains pending; expected routing in five examples is not a general safety guarantee.

## Actual PayPal sandbox execution

The production app ran at `http://localhost:3107` with a separately named ledger under `.local/live-production/`, preserving the default application ledger.

- Login using the configured owner password succeeded.
- The configured agent was denied owner audit/decision authority.
- A $900 machine was blocked, a $180 hamper required review, checkout before approval was denied, and owner rejection safely released the reservation.
- One actual $18 coffee order was created using sandbox seller OAuth. The provider response matched the saved request, expected merchant, USD currency and exact total.
- Repeated checkout reused the same provider order and one saved create operation.
- Reading the saved order through reconciliation succeeded.
- Observed budget after initial creation: **$0 spent, $18 reserved**. That checkout awaited buyer consent and subsequently expired, as recorded below.
- The fresh checkout was approved and captured by the user through the app. The verification harness reconciled the saved order without initiating another capture; completed provider evidence and exactly-once ledger state are recorded below.

The user was given the running app URL and instructions to resume this saved checkout with a separate sandbox Personal buyer account. Internal requests expire after 15 minutes; a stale request must not be captured or bypassed. Preserve the test ledger and reconcile uncertain state rather than resetting it.

### Buyer-consent follow-up

The user completed buyer consent on the first order. An authenticated provider read confirmed `APPROVED`, the expected merchant, and USD $18. However, the request had expired at 4:12:43 p.m. IST before the capture instruction was received. The app correctly retained `EXPIRED`, released the reservation, and kept spend at zero; no capture was attempted. This verifies the real-provider expiry boundary, not a completed payment.

A fresh $18 checkout was prepared in the same isolated ledger and requires its own buyer consent. It expires at 4:30:09 p.m. IST on 11 November. The first order and its verification are preserved in `.local/live-production/expired-order-report.json`; the current checkout is recorded in `.local/live-production/report.json`.

### Completed sandbox payment

At 4:17:43 p.m. IST, after the user completed buyer consent and capture through the app, the verification harness confirmed:

- Provider order `51E52028N08270322` was `COMPLETED`.
- Capture `03P17699C0433174T` was `COMPLETED` for exactly **USD $18.00**, with the expected merchant verified.
- Local request was `CAPTURED` and matched the provider capture ID.
- Ledger: **$18 spent, $0 reserved, $382 available**.
- Two authenticated reconciliation refreshes left spend unchanged.
- Exactly one saved capture operation and one `PAYMENT_COMPLETED` audit event existed.

No second capture was initiated by the verification harness. Evidence is saved in `.local/live-production/capture-report.json`; the main integration report now records completion.

## Browser and production security checks

Headless Chrome used the real configured owner login against the production build. Both integrations appeared configured, the saved sandbox order reference appeared in request details, and desktop/mobile checkout views rendered without uncaught page errors or horizontal overflow at 390 px. No capture control was clicked.

Production CSP was present. Configured credentials were absent from the client entry bundle. Requests for `.env`, private test reports, and server source did not expose their contents. These bounded checks are not a full security audit.

## Evidence and remaining acceptance

Untracked evidence:

- `data/model-evaluation.json`: initial evaluation.
- `.local/live-production/model-evaluation-v3.json`: paced live rerun with actual provider/model and public output.
- `.local/live-production/report.json`: sandbox order and persisted ledger references.
- `.local/live-production/browser-report.json` and `screenshots/`: production browser evidence.

Still required: buyer cancellation, real-provider restart/callback recovery, and human acceptance of planner explanations. See [INTEGRATION_CHECKLIST.md](INTEGRATION_CHECKLIST.md).
