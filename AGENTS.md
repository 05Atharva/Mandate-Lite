# Mandate Lite — working agreement

Read `docs/USER_JOURNEYS.md`, `docs/DESIGN_SYSTEM.md`, and the PRD before changing the experience. `claude.md` points to this same agreement; keep one source of truth.

## Product

Mandate Lite is a premium, approachable purchasing workspace for small teams and builders integrating an agent. The agent proposes, the merchant gateway enforces the mandate, the owner approves expenses, and the PayPal buyer consents separately. Never merge these authorities in copy or behavior.

## Design

- Follow the documented Boundary identity: a custom geometric M inside open boundary corners. Use the original SVG assets and `Brand` component, never a stock shield as the logo.
- Use warm graphite, mineral ivory, and citron. All app surfaces, inputs, overlays, status colors, and AG Grid must support light and dark themes through semantic tokens.
- Typography: locally hosted Manrope for the interface and Space Grotesk for display/figures, with robust fallbacks. Keep body and form text readable; don't shrink content to make it fit.
- Use the 4 px spacing scale, consistent panel padding, clear hierarchy, and progressive disclosure. Avoid decorative dashboard metrics or fake activity.
- Mobile is a first-class layout: persistent labelled navigation, 44 px targets, safe-area spacing, usable drawers, and no horizontal page overflow at 360 px.
- Build motion by hand with CSS, SVG, or native Web Animations. No animation libraries. Motion communicates orientation, progress, and feedback; it must not delay payment actions or imply an unverified success.
- Respect reduced motion, keyboard access, focus restoration, screen-reader labels, contrast, and error recovery. Theme preference persists locally and initially follows the device.

## Engineering

- Preserve Express/SQLite state, server-authoritative totals, immutable approvals, idempotency, CSRF, role separation, and conservative payment reconciliation.
- Never seed fictional payment activity into the live workspace. `/replay` is explicitly simulated and must stay separate.
- Keep provider credentials server-side. Never write secrets or plaintext test credentials to tracked files.
- Keep design changes scoped. Do not migrate frameworks, introduce a UI kit, or change the payment contract for visual work.
- Use `npm run check`, `npm test`, and `npm run build` for substantial frontend work. Node 24.14+ is required for runtime tests. Record browser QA honestly; static inspection is not browser verification.
- Update the design documentation when conventions change. Do not claim live PayPal/model acceptance from fixtures.
