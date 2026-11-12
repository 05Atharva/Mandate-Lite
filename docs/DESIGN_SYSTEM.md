# Boundary — Mandate Lite design system

## Identity first

The mark is a bespoke geometric M formed from two upright strokes and an inset valley, framed by two open boundary corners. The M represents the purchasing mandate; the corners express useful autonomy inside an explicit perimeter. The small citron square is the point where permission becomes a deliberate action. The mark must work at favicon size and in one color; it does not depend on raster artwork.

Assets live in `public/brand/`. `src/Brand.tsx` is the reusable interface wordmark. Leave clear space of at least one quarter of the mark's width. Keep the wordmark lowercase and the Lite label secondary. Do not stretch, add gradients, or replace the mark with a generic security icon.

## Visual language

An editorial operations workspace: warm paper, graphite ink, precise lines, generous spacing, citron used sparingly for primary actions and the budget card. Light is mineral ivory; dark is a warm near-black with lifted charcoal panels. Semantic feedback colors remain distinct from brand color.

Manrope provides readable, friendly interface text. Space Grotesk gives headings and monetary figures a more architectural character. Fonts are hosted locally with `font-display: swap`; fallbacks remain functional offline. Use 16 px body/input text, 14 px supporting text, 12 px metadata, and fluid 28–40 px headings. Financial figures use tabular numerals. Do not animate money counting up from a fictitious value.

Use semantic CSS variables for page, surface, raised surface, ink, muted text, line, accent, focus and each status. No isolated hardcoded light cards in dark mode. Spacing uses 4/8/12/16/24/32/48/64 px. Panels use 20–28 px padding, 16–20 px radii, restrained borders and minimal shadow. Form controls use 12 px radii and at least 44 px targets.

## Screen composition

- Overview: title and new-purchase action; one visually distinct budget panel; spent/reserved/available; attention queue; guardrails; searchable audit. Every number comes from the server.
- Purchase desk: three-step orientation, need and grounded result, proposed basket, manual catalog. Preserve useful whitespace and readable quantities.
- Mandate: readable form or locked published rules; an explanatory permission sequence beside it on wide screens.
- Request details: amount/status, frozen basket, rule checks, approval, audit, then expandable references. Actions remain reachable at the bottom.
- Mobile: labelled fixed bottom navigation, compact top identity, stacked panels, safe-area padding, full-width detail sheet. Advanced grid yields to request cards.
- Login: original boundary artwork and a focused sign-in card. The read-only replay is a deliberate, clearly simulated exploration path.

## Hand-authored motion

No animation dependency. Use CSS keyframes, transitions, SVG stroke animation and native browser APIs only. The signature is a short boundary opening and settling into alignment.

| Interaction       | Motion                                                   | Purpose                                                 |
| ----------------- | -------------------------------------------------------- | ------------------------------------------------------- |
| View change       | 240 ms, 8 px rise with deceleration                      | Orient the user to a new working surface                |
| Button press      | 120 ms, slight compression                               | Immediate tactile acknowledgement                       |
| Drawer            | 280 ms translate and fade; backdrop 160 ms               | Stage the decision and preserve spatial context         |
| Drawer close      | 160 ms exit before removal                               | Return to the underlying purchase                       |
| Planner busy      | Bounded repeating line movement while request is pending | Communicate actual work without fictitious progress     |
| Logo introduction | One short stroke reveal                                  | Establish identity once, without continuous distraction |
| State badge       | Brief entrance on an actual state change                 | Reinforce a new outcome without moving content          |

Use a shared deceleration curve `cubic-bezier(.22, 1, .36, 1)`. Avoid bouncy money, ambient dashboard loops, parallax during tasks, hover-only information, and animation on background refresh. Reduced motion disables travel, looping decoration and transitions. Never delay authorization or provider requests for choreography.

## References and interpretation

The hierarchy, proximity, alignment, consistency, contrast, accessibility, and progressive disclosure choices follow [Figma's UI principles](https://www.figma.com/resource-library/ui-design-principles/). Motion uses staging, anticipation, timing, and follow-through from [User Interface Wiki](https://www.userinterface.wiki/12-principles-of-animation), [CSS Animation](https://cssanimation.rocks/principles/), and [OpenClassrooms](https://openclassrooms.com/en/courses/5625816-create-modern-css-animations/5794716-apply-the-12-principles-of-animation-to-the-web). [SVGator inspiration](https://www.svgator.com/blog/tag/inspirational/) informed the consideration of vector identity motion; no templates or animation libraries are used. The supplied Tubik URL returned HTTP 403 during research, so no claim is made to have reviewed its contents.

## Review standard

Check both themes, device-following preference, 360/390/768/1280 px widths, long request names, empty/error/review/uncertain states, keyboard focus, reduced motion, and drawer scroll/action reachability. Validate real interactions in a browser where available. Record evidence and limitations in the current QA document; previous screenshots do not validate this redesign.
