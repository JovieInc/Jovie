# night-dj-harmony-v1

Glow and glass stay CSS tokens. No canvas, WebGL, or video on a surface.

This is the repo contract for that design invariant. gbrain was unavailable when
it was recorded, so this file is the copy the hero-light check reads. The
sentence above is the invariant. The exception below does not replace it, and
it does not apply to any other surface.

Sibling performance contract: [`performance-invariants-v1`](../performance/performance-invariants-v1.md).

## Scoped exception

approved by Tim, scoped to the flagged hero prototype only. Dated 2026-10-22 8:47 PM PT.

The exception applies only to the homepage hero decorative layer. It does not apply
to any other surface. The hero ships enabled. There is no feature flag. There is no
video. The canvas is `aria-hidden` and `pointer-events: none`, and it loads after
idle. No WebGL support, reduced motion, save-data, low-power, and context loss keep
the CSS poster, with no layout shift. The glass bar stays on CSS tokens
(`backdrop-filter` via `--blur-header`).

<!-- hero-light-webgl-exception/v1
{
  "schema": "hero-light-webgl-exception/v1",
  "status": "approved",
  "approval": "approved by Tim, scoped to the flagged hero prototype only",
  "approvedAt": "2026-10-22 8:47 PM PT",
  "approver": "Tim",
  "rule": "Glow and glass stay CSS tokens. No canvas, WebGL, or video on a surface.",
  "invariant": "night-dj-harmony-v1",
  "sibling": "performance-invariants-v1",
  "amendsInvariant": false,
  "surface": "homepage hero decorative layer",
  "otherSurfaces": false,
  "module": "apps/web/components/homepage/hero-light/hero-light-gl.ts"
}
-->
