# Live integration gate

Live gate status: **not executed**. Local automated and browser checks are recorded in [VISUAL_QA.md](VISUAL_QA.md) and [PRD_COVERAGE.md](PRD_COVERAGE.md). Use isolated sandbox accounts and retain redacted request/order/capture references when actually running the live gate.

## Prerequisites

- Node 24.14+, installed dependencies and an untracked `.env`.
- Distinct owner and agent credentials.
- PayPal sandbox seller client ID, secret and matching merchant ID; a separate sandbox buyer.
- OpenAI API key and access to the configured structured-output model. Model calls can incur actual charges.
- Browser approval for the local origin.

## Gate G1

- [ ] Sign in, activate a fresh pilot mandate and submit the $18 coffee.
- [ ] Create an actual sandbox order and record its order ID.
- [ ] Complete buyer consent at PayPal; explicitly verify and capture on return.
- [ ] Confirm the capture is `COMPLETED`, amount/currency/payee match, and spent increases by exactly $18.
- [ ] Refresh the saved order; verify spend is not counted twice.
- [ ] Create a separate permitted request, observe PayPal cancellation, and close without payment. It must remain unpaid and release only before a capture claim.
- [ ] Run one real model plan and save its actual model identifier and structured selection.

If G1 fails, capture the sanitized error and fix integration before presenting a working payment claim.

## Model evaluation

For each prompt, record the real model, response time, selected SKUs/quantities or clarification, and any manual correction. Do not record hidden chain-of-thought.

1. “Restock one 500 g bag of studio blend coffee.”
2. “We have six new starters. Choose one reusable pen set per person under $80; avoid electrical items.”
3. “Choose one celebration hamper for six people.”
4. “Buy something nice for the team.” Expect a useful clarification rather than an arbitrary costly basket.
5. “I need a nut-free hamper for six people.” The catalog has no verified suitable nut-free hamper; expect clarification.

## End-to-end acceptance

- [ ] $900 espresso basket is blocked without a PayPal order.
- [ ] $180 gift requires an exact owner decision; an agent key receives HTTP 403 on owner routes.
- [ ] Owner-approved gift still requires buyer consent; completed receipt uses its actual provider order/capture IDs.
- [ ] Repeated clicks and another browser tab reuse the saved request/order.
- [ ] Stop/restart the server with the same database; budget, decisions and operations survive.
- [ ] An expired or revoked request cannot start capture. An in-flight payment remains explicitly uncertain until verified.
- [ ] Desktop and 390 px layouts have readable totals/statuses, usable controls, and no horizontal page overflow.
- [ ] Keyboard navigation reaches every action; drawer traps focus, Escape closes it, and reduced motion is respected.
- [x] Automated clean setup: `npm ci`, `npm test`, `npm run build`, seed and production server/login/policy checks passed in an isolated source copy using `npm run verify:fresh`.

Automated tests cover injected lost/pending/declined responses, tampering, concurrency and restart recovery. They do not replace the live provider or browser checks above.
