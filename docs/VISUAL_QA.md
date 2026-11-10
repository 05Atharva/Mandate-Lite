# Browser verification — 10 November 2026

Verified in the built-in browser against the local development server, using an isolated `.local/browser-check.sqlite` database. No real model or PayPal calls were made. All baskets in this run were explicitly labelled manual selections.

## Views and sizes

- Owner sign-in, mandate activation, purchase desk, catalog, overview and request details inspected at desktop width (1280 × 900).
- Overview, purchase desk/catalog, published mandate and approval drawer inspected at mobile size (390 × 844).
- No horizontal page overflow observed in the mobile overview, purchase desk or mandate. The drawer fitted the mobile viewport and kept its action buttons reachable.
- Budget amounts, outcome labels, rule messages and missing-integration states were readable in the screenshots.

## Exercised behavior

- Activated the immutable $400 mandate with a $200 order cap and review above $150.
- Submitted $18 coffee: policy allowed; checkout correctly disabled without seller configuration.
- Submitted a $180 gift: owner review required. Approved it and verified the explicit “Buyer consent still needed” message.
- Submitted a $900 espresso machine: blocked by category, order-cap and available-budget rules; no checkout action offered.
- Submitted and rejected a second $180 review request. Budget returned to $198 reserved, $202 available, and $0 spent.
- Verified purchase search and status filtering each narrowed the activity list to the blocked espresso request.
- Verified forward/backward keyboard focus stays inside the review drawer, Escape closes it, and Enter opens verification references.
- No browser console errors or warnings were reported by the captured console log check.

## Fixes made during verification

1. Seed the purchase list from the persisted submission response before opening its drawer. This removes a transient “Request unavailable” flash while budget/audit refresh is in progress. Rechecked by submitting another review request.
2. Include the native `summary` element in the drawer focus trap. A blocked request previously trapped Tab on its close button, preventing keyboard access to verification references. Rechecked Tab and Enter on the blocked request.

## Evidence and remaining checks

Local screenshots are saved in `.local/qa/overview-desktop.jpg` and `.local/qa/overview-mobile.jpg`; runtime data and screenshots are intentionally untracked.

Live model planning, actual PayPal buyer consent/capture/cancel and real pending-payment behavior remain pending. See [the integration checklist](INTEGRATION_CHECKLIST.md). This browser run establishes UI and manual policy behavior, not live payment or model integration success. Fresh-setup verification was completed in the follow-up below.

## Follow-up verification after completing the code gaps

- Persisted owner sign-in succeeded against the existing isolated QA ledger; expired requests retained their history and released their reservations.
- AG Grid Community rendered without captured console errors/warnings. Entering “Espresso” into its Purchase column filter left the single matching request visible.
- At 390 px the advanced grid correctly switched back to four mobile request cards, with no horizontal page overflow.
- The separate `/replay` view rendered on desktop and 390 px mobile, with a visible fixture-only banner, fictional references and no approve/capture controls. Selecting the blocked fixture showed its no-payment explanation.
- A browser download permission gate declined the filtered CSV download. The browser file-download step is therefore **unverified**; no alternate download path was attempted. CSV neutralization is covered by the automated test.
- Follow-up screenshots: `.local/qa/advanced-audit.jpg`, `.local/qa/replay-desktop.jpg`, `.local/qa/replay-mobile.jpg`.
- The isolated fresh-setup command passed installation, 34 tests, build, seed, production HTTP, owner login and manual policy submission. The report is `.local/fresh-setup-report.json`. No live provider calls were made.
