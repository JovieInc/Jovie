# night-dj-harmony-v1

Glow and glass stay CSS tokens. No canvas, WebGL, or video on a surface.

This is the repo contract for that design invariant. gbrain was unavailable when
it was recorded, so this file is the copy the hero-light check reads. The
sentence above is the invariant. The exception below does not replace it, and
it does not apply to any other surface.

Sibling performance contract: [`performance-invariants-v1`](../performance/performance-invariants-v1.md).

## Scoped exception

approved by Tim, scoped to the flagged hero prototype only. Dated 2026-10-22 8:47 PM PT.

The exception applies only when `SHOW_HOMEPAGE_HERO_LIGHT_WEBGL` is on, and only to the
homepage hero decorative layer. `SHOW_HOMEPAGE_HERO_LIGHT` obeys the invariant, including
the glass bar (`backdrop-filter` via `--blur-header`). Both flags stay default off.
There is no video. The canvas is `aria-hidden` and `pointer-events: none`, and it loads
after idle. Reduced motion, save-data, and low-power never create a canvas. The CSS
flag alone never authorizes a canvas.

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
  "cssFlag": "SHOW_HOMEPAGE_HERO_LIGHT",
  "webglFlag": "SHOW_HOMEPAGE_HERO_LIGHT_WEBGL",
  "appliesOnlyWhen": "SHOW_HOMEPAGE_HERO_LIGHT_WEBGL",
  "defaultOff": true,
  "otherSurfaces": false,
  "module": "apps/web/components/homepage/hero-light/hero-light-gl.ts"
}
-->
