# Scroll Audit Protocol

> Establishes a deterministic, repeatable process for catching overscroll and
> scroll-bleed regressions on every route. Covers iOS Safari, Android Chrome,
> and desktop app shell. See JOV-1330.

---

## CSS Architecture (current state)

| Layer | Element | Rule | Why |
|---|---|---|---|
| Root | `html, body` | `overscroll-behavior: none` | Prevents iOS rubber-band bounce and Android pull-to-refresh on the document root |
| App shell outer | `AppShellFrame` outer `div` | `overflow-hidden` | Hard clip — nothing escapes the viewport frame |
| App shell inner scroll panel | `AppShellFrame` content `div` | `overscroll-behavior: contain` (`overscroll-contain`) | Prevents scroll bleed from reaching the `html`/`body` layer when a user scrolls past the end of the inner panel |
| Table routes | Same content `div`, table variant | `overscroll-behavior: contain` | Same containment for horizontal-scroll table views |

**Rule of thumb:** every element with `overflow-y-auto` or `overflow-x-auto` that
a user can physically scroll must carry `overscroll-behavior: contain` (Tailwind:
`overscroll-contain`) unless it is the intentional top-level document scroll.

---

## Audit Checklist

Run through this checklist for every new scrollable panel, page, or layout
change. Check all three environments (iOS, Android, Desktop).

### 1. iOS Safari — rubber-band / momentum scroll

- [ ] Open the route in Safari on a real iOS device (or Xcode Simulator with
      Safari Web Inspector).
- [ ] Scroll to the **bottom** of the main content panel and continue pulling
      down. The panel should hit the bottom and stop — the page behind it must
      **not** bounce.
- [ ] Scroll to the **top** and pull down. Same check — no document bounce.
- [ ] If the route has nested panels (e.g. a drawer or right panel), repeat for
      each panel independently.
- [ ] Verify: no white/background flash at top or bottom of any panel.

### 2. Android Chrome — overscroll glow / pull-to-refresh

- [ ] Open the route in Chrome on Android (real device preferred; Android
      Emulator with Chrome DevTools also acceptable).
- [ ] Scroll to top of the main panel and pull further. There must be **no**
      pull-to-refresh indicator triggered.
- [ ] Scroll to bottom and continue dragging. The overscroll glow must stay
      inside the panel — the page behind must **not** move.
- [ ] Verify no unintended color flash (the browser's default overscroll
      background color).

### 3. Desktop — shell scroll bleed

- [ ] Open the route in Chrome/Firefox/Safari on desktop.
- [ ] With the browser window sized to approximately 1280 x 800, place the
      cursor over the main content panel and scroll with the mouse wheel past
      both ends.
- [ ] The **outer shell** (sidebar, header bar) must not move or scroll.
- [ ] If the browser exposes overscroll chaining (e.g. Safari on macOS with
      rubber-band scrolling enabled), verify the shell frame does not bounce.
- [ ] Resize the window to mobile breakpoint (< 768 px) and repeat.

### 4. Nested scroll containers

For any panel that contains a secondary scrollable region (right panel, drawer,
data table with horizontal scroll, chat feed, etc.):

- [ ] Confirm the nested container carries `overscroll-behavior: contain`.
- [ ] Verify scrolling inside the nested container does **not** propagate to the
      parent panel or the document.
- [ ] Check both axes: vertical scroll bleed **and** horizontal scroll bleed
      (relevant for wide tables).

### 5. Fixed / sticky elements

For any element with `position: fixed` or `position: sticky`:

- [ ] Confirm it does not jitter or reposition during overscroll bounce on iOS.
- [ ] Confirm it is not clipped unexpectedly by an ancestor with
      `overflow: hidden`.

---

## Adding a New Scrollable Panel — Developer Checklist

When introducing a new element with `overflow-y-auto`, `overflow-x-auto`, or
`overflow: scroll`:

1. Add `overscroll-contain` (Tailwind) or `overscroll-behavior: contain` (CSS)
   to that same element.
2. If the element is the top-level document scroll (rare in the app shell), use
   `overscroll-behavior: none` instead.
3. Run the Desktop checklist above in a browser before opening your PR.
4. Reference this document in your PR description: "Scroll audit: passed."

---

## Key Files

| File | Role |
|---|---|
| `apps/web/app/globals.css` | Root `html, body` overscroll rules |
| `apps/web/components/organisms/AppShellFrame.tsx` | App shell scroll container — carries `overscroll-contain` |
| `apps/web/tests/SCROLL-AUDIT.md` | This document |

---

## Regression Detection (Automated)

A Playwright smoke check for scroll containment is tracked in JOV-1330. Until
that test is added, rely on the manual checklist above before merging any PR
that touches layout, overflow, or scroll-related CSS.
