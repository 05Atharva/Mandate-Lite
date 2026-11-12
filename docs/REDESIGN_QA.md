# Boundary redesign verification — 11 November 2026

The redesign keeps the existing React/Express application and payment contract. Its user journeys were written before changing screens; the original M/boundary identity was implemented before the theme and screen updates. Brand review is available at `/brand` and `/brand/`.

## Executed checks

- TypeScript validation passed.
- All 35 existing automated tests passed using an isolated Node 24.22.2 runtime, including role separation, CSRF, budget contention, approval binding, idempotency, and recovery. No model or PayPal calls were made.
- Production build passed. The existing lazy AG Grid bundle emits Vite's large-chunk advisory; it remains loaded only when advanced audit is opened.
- Headless Chrome exercised the built production app against a separate untracked SQLite ledger with randomly generated owner/agent credentials. No real credentials or provider calls were used.
- Owner login, mandate activation, manual coffee allowance, exact gift approval, machine block, missing-configuration checkout disabling, and mobile sign-out worked.
- Both themes were checked at 360, 390, 768, and 1280 px across overview, purchase desk, and mandate screens. No horizontal page overflow was detected.
- Dark preference persisted across reload. System preference followed live emulated device changes.
- Advanced audit rendered in dark mode. Mobile used request cards.
- The mobile drawer fitted the viewport, kept keyboard focus inside, closed with Escape, and restored focus to its originating purchase row. Reduced-motion emulation disabled view transitions.
- The final complete browser run recorded no uncaught page errors. The brand study and fixture replay rendered at 360 and 1280 px without page overflow; the brand study's identity heading was explicitly verified.

## Review correction

Visual review found that Express redirects the `/brand` asset directory to `/brand/`. The React route now normalizes trailing slashes so the identity study renders at both URLs. The browser check was strengthened to require the identity heading rather than accepting any page without overflow.

The stronger keyboard check also found that focus could be restored before React removed `inert` from the workspace. Restoration now runs after the close has committed, and the final browser pass asserts that focus returns to the purchase row.

## Local evidence

Untracked screenshots and the browser report are in `.local/redesign-qa/`. The disposable verification script is `.local/redesign-qa.mjs`; its tooling/runtime are under `.local/qa-tools/`, with no project dependency changes. The check's server is stopped afterward.

## Limits

These checks establish local interface behavior and regression coverage, not live model quality, real PayPal checkout, device hardware testing, or a complete accessibility audit. The PRD's live integration gate is still pending. The user-supplied Tubik reference returned HTTP 403; the other supplied design/animation references were accessible.
