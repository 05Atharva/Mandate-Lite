# User journeys — design before screens

These are product hypotheses derived from the PRD, not completed customer research.

## People and jobs

| Person              | Job                                                      | What a good experience makes clear                                                           |
| ------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Small-team owner    | Delegate supply selection while keeping spending bounded | What is available, what needs attention, and what has actually been paid                     |
| Team purchaser      | Turn a contextual need into a suitable basket            | Products, quantities, total, constraints, and the next required action                       |
| Integration builder | Connect an agent to controlled merchant checkout         | Proposal authority, stable request references, deterministic decisions, recoverable failures |
| PayPal participant  | Consent to a specific payment                            | Expense approval is distinct from buyer consent and capture                                  |

## 1. First visit and activation

As an owner, I want to understand the permission boundary before signing in, then publish a mandate without guessing what each threshold means.

Entry → owner sign-in → empty overview → set up mandate → review budget, cap, threshold, categories and expiry → activate → locked rules.

Acceptance: activation is the only prominent first-run task. Form labels explain money and local expiry. Invalid settings prevent submission. The lock and revocation consequences appear before activation. No fake spending fills the empty dashboard.

## 2. Everyday purchase

As a purchaser, I want to describe a need, inspect a grounded suggestion, and understand the permission result before leaving for PayPal.

Purchase desk → describe need → actual model selection or clarification → inspect/edit basket → check mandate → allowed, review, or blocked → explicit next action.

Acceptance: show an understandable three-step journey; preserve the original need during clarification; editing a suggestion removes AI provenance. Manual selection is easy to find and clearly labelled. The basket total remains visible and readable on mobile. Loading describes the operation without invented percent progress.

## 3. Owner review on a phone

As an owner, I want to inspect a request quickly and approve the exact expense while away from my desk.

Overview attention queue → request drawer → amount and frozen items → rule explanation → approve/reject → explicit result and updated budget.

Acceptance: visible status text accompanies color. Amount and primary action are prominent. The drawer fits small screens, traps focus, supports Escape and restores focus. Approval says buyer consent remains required. Rejection releases the reservation through the existing service.

## 4. Buyer checkout and uncertain outcomes

As a buyer, I want to understand the handoff and safely recover when a payment response is interrupted.

Permitted request → Continue to PayPal → buyer consent → return confirmation → explicit verify and capture → completed receipt or checking state → refresh provider state.

Acceptance: a redirect never looks like proof of payment. Only completed provider evidence earns a payment-completed receipt. Uncertainty retains its reservation and communicates the next action. No celebratory animation suggests success while checking. Repeated actions reuse the existing operation.

## 5. Builder inspection and audit

As an integration builder, I want to trace a request without reading technical identifiers on every screen.

Search/filter activity → inspect request → human-readable rules and timeline → expand references → view basket hash, model/template, operation/order/capture identifiers → export audit.

Acceptance: technical detail is progressive disclosure. Desktop advanced audit and CSV export are available; mobile has readable cards. JSON export stays available. Statuses and amounts match the authoritative service.

## 6. Comfort and continuity

As a returning user, I want a comfortable theme, predictable navigation, and motion that helps me maintain context.

Device preference on first visit → choose light/dark/system → preference survives reload → labelled navigation on every device → short transitions on deliberate view changes.

Acceptance: theme controls are accessible before sign-in and in the workspace. System mode follows live device changes. Reduced-motion users get immediate state changes. Refresh polling does not replay entrances or move focus.
