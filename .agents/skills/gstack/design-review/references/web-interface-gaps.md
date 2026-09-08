# Web interface gaps (canonical design-review fold)

Owner: `/design-canonical` then `/design-review`. Not a parallel skill.

This is the uncovered fold from the pinned
`docs/vendor/vercel-labs/web-interface-guidelines/command.md` pin
`e3d624baaf29dc1fc645aff3e38f03e564d2d6b1`. Already-covered items stay in
the existing Phase 3 categories (focus, motion, images, contrast, truncation).
`DESIGN.md` and `design-canonical` remain authoritative. Do not fetch `main`.
Do not invoke `web-design-guidelines`.

Load this file during design review Phase 3 / design-canonical Step 4 when
the surface includes forms, overflow, media, localization, browser chrome,
or accessibility work.

## Forms

- Inputs have `autocomplete` and a meaningful `name`.
- Correct `type` / `inputmode` (`email`, `tel`, `url`, `number`).
- Never block paste (`onPaste` + `preventDefault`).
- Labels are clickable (`htmlFor` or wrapping control).
- Disable spellcheck on emails, codes, and usernames.
- Checkbox/radio label and control share one hit target.
- Submit stays enabled until the request starts; spinner only during the request.
- Errors sit inline next to fields; focus the first error on submit.
- Placeholders end with `…` and show an example pattern.
- `autocomplete="off"` on non-auth fields so password managers do not trigger.
- Warn before navigation with unsaved changes (`beforeunload` or router guard).

## Overflow

- Flex children that truncate need `min-w-0`.
- Modals, drawers, and sheets use `overscroll-behavior: contain`.
- Fix overflowing content; do not hide a layout bug with blanket `overflow-x-hidden`.
- User-generated text anticipates short, average, and very long inputs.

## Media

- Meaningful audio/video needs captions, transcripts, or descriptions.
- Media controls are keyboard operable; decorative media is assistive-tech hidden.
- Prefer compressed video over animated GIF; provide a still alternative.
- Short decorative loops: muted, `prefers-reduced-motion` still fallback, pause/stop if >5s.

## Localization

- Dates/times use `Intl.DateTimeFormat`, not hardcoded locale strings.
- Numbers/currency use `Intl.NumberFormat`.
- Language from `Accept-Language` / `navigator.languages`, never IP geolocation.
- Brand names, code tokens, and identifiers wrap `translate="no"`.

## Browser

- `touch-action: manipulation` on interactive controls (no double-tap zoom delay).
- Set `-webkit-tap-highlight-color` intentionally.
- Drag/swipe/pinch actions also have tap/click and keyboard alternatives.
- `autoFocus` is desktop-only and only for a single primary input.
- Skip link to main content; `scroll-margin-top` on heading anchors.
- Sticky headers, footers, and overlays must not cover the focused element.
- Dark surfaces set `color-scheme` on `<html>` and matching `theme-color`.
- Native `<select>` sets explicit `background-color` and `color`.

## Accessibility gaps

- Icon-only buttons have `aria-label`.
- Form controls have a visible label or `aria-label`.
- Interactive elements have keyboard handlers; use `button` for actions and
  `a`/`Link` for navigation (Cmd/Ctrl/middle-click must work).
- Async updates (toasts, validation) use `aria-live="polite"`.
- Semantic HTML before ARIA; headings stay hierarchical.
- Deep-link stateful UI (filters, tabs, pagination, expanded panels) in the URL.
