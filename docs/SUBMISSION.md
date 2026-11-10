# Mandate Lite — submission preparation

Draft only. Complete the evidence fields after real integration testing; do not submit this as a claim of a verified live checkout.

## Pitch

Let an AI agent prepare a purchase. Keep spending permission explicit, enforce it before payment, and connect the decision to the final receipt.

Mandate Lite is a single-merchant purchasing prototype for a small team. A catalog-grounded planner selects SKU quantities. The server freezes prices and checks an immutable pilot mandate, reserves cumulative budget atomically, and requires exact owner approval above a threshold. PayPal buyer consent is separate; payment is completed only when the server verifies the expected capture.

## Demonstration sequence — 2 minutes 45 seconds

| Time      | Screen/action                                                | Evidence needed                                            |
| --------- | ------------------------------------------------------------ | ---------------------------------------------------------- |
| 0:00–0:15 | Team purchasing scenario and scope                           | One merchant, owner, agent and USD                         |
| 0:15–0:30 | Published $400 mandate and budget                            | Real local/hosted mandate                                  |
| 0:30–0:55 | Actual AI plans $18 coffee; server allows                    | Provider/model result; manual fallback does not count      |
| 0:55–1:10 | $900 espresso machine blocked                                | Failed rules; no order                                     |
| 1:10–1:50 | $180 gift review, owner approval, PayPal consent and capture | Continuous actual sandbox order/capture references         |
| 1:50–2:15 | Receipt, audit and saved-order refresh                       | Expected completed capture; no duplicate spend             |
| 2:15–2:35 | Architecture and trust boundary                              | Model proposes; merchant gateway enforces; buyer consents  |
| 2:35–2:45 | Measured checks and next step                                | Actual test/model timing results; merchant interviews next |

## Evidence to fill after execution

- [ ] Real model provider/model and five reviewed prompt results
- [ ] Actual coffee or gift order/capture IDs, expected gross/currency/payee and `COMPLETED` status
- [ ] Actual cancellation remains unpaid
- [ ] Live reconciliation/restart observation
- [ ] Public repository visibility and license verified
- [ ] Public English demo video URL recorded
- [ ] Judge setup/access instructions verified with another person
- [ ] Any impact/user-interview claims backed by real observations

## Judge setup

Follow [README](../README.md) for the local Node application. Supply isolated sandbox credentials privately through the submission's testing instructions. Do not publish `.env`, merchant secrets, owner passwords, agent keys or model keys. The read-only replay is illustrative and explicitly simulated; it supplements the live demo.

## Claims to preserve

This governs only the integrated merchant checkout. It does not give an agent unattended wallet access or prevent purchases elsewhere. Approval is an expense decision, not PayPal consent or completed payment. The audit is useful application history, not administrator-proof immutable evidence. Zero shipping and tax are declared sandbox fixtures. A capture claimed before revocation may still finish.
