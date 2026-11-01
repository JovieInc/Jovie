# Marketing motion and shader language

For app and component motion (durations, easing ladder, press and hover rules) read `.claude/rules/motion.md`. This guide is the marketing layer: four named effects, one budget rule, one registry. Invariant: ASR-039 in `docs/design-system/anti-slop-rules.json`.

## Decisions
- Matte, near-black, monochrome by default. Depth is tonal steps (canvas `#030406`, then shell, then card), a soft shadow and fine grain.
- Color appears only as a thin line, one small glow or one accent word. No glass shine, no specular highlights, no colored fields.
- Motion carries the story between scenes. Nothing loops for decoration except the matte field's very slow drift (at most 0.012 uv/s) and grain shimmer.
- Every effect has a static fallback that is the designed rest state. `prefers-reduced-motion` means the rest state with no `requestAnimationFrame` scheduled.
- Every effect pauses offscreen (IntersectionObserver) and in hidden tabs. GL renders at half resolution, capped at 30fps. CSS effects animate `transform` and `opacity` only.
- Curves and durations are the cinematic tokens (`--ease-cinematic`, `--duration-cinematic`). No raw `cubic-bezier` in components; `pnpm --filter @jovie/web run lint:motion-css` enforces it.

## The four effects
Typed values live in `apps/web/lib/motion/presets.ts` (`motionPresets.matteField | heroShellZoom | shellParallax | chatTakeover`). The CSS tokens are in `design-system.css`; `presets.test.ts` pins the two together, including the reduced-motion resets.

| Effect | Code | Budget | Fallback and rest state |
|---|---|---|---|
| matteField: removed 2026-10-29 (no production consumers; marketing backgrounds are static matte). Presets remain for a future registered effect. | none | Register in `apps/web/data/marketing/animatedBackgroundBudget.ts` first (`defaultEnabled: false`, <= 2ms per frame). | Static matte page background. |
| heroShellZoom: pinned 100svh hero, scroll-linked. The product shell scales 1.94 to its rest frame while the claim form stays under the eye; headline lifts and dims; frame hairline fades in; logo row enters at p >= 0.85. | `components/marketing/motion/hero-shell-zoom.ts` (`heroZoomFrame`, `bindHeroShellZoom`) | 1.5 KB gzip, zero GL | Rest frame: headline above the full shell, logo row below. Also the no-JS state. |
| shellParallax: CSS 3D depth. Enter from `rotateX(--motion-parallax-tilt)` and `translateY(80px)` over two cinematic durations; three lifted planes (claim form 18px, right rail 30px, audio dock 8px). Pointer adds at most `--motion-parallax-pointer-max`, fine pointers only. | Presets and tokens only; the page owns the markup. | CSS transforms only | Flat frame, no plane separation, no pointer tilt (tokens reset to 0). |
| chatTakeover: profile hands the screen to the conversation on send. 420ms cinematic; profile lifts `--motion-takeover-lift`, scales to 0.98, fades out over the first 70%; conversation settles from `--motion-takeover-settle` and fades in from 30%; the composer is a shared element and does not move. | Presets and tokens only; app code reads them. | CSS transforms only | 150ms opacity cross-fade. |

`bindHeroShellZoom(root)` writes `--hero-zoom-scale|x|y|headline-y|headline-o|edge-o|logos-o|logos-y` on `root` from a passive scroll listener and returns cleanup. It reads `--ds-motion-cinematic-easing` from the computed style and falls back to the preset curve. It never listens to wheel or touch and never calls `preventDefault`. Style the page from those variables; do not drive layout from them.

## Register an effect
1. Add an entry to `docs/design-system/motion-effects.json`: `id`, `files` (exact paths, or a directory ending in `/`), `fallback` (a regex that appears in the effect's source, naming the static fallback), `reducedMotion` (`marker` plus `requiredIn`, the files that must read the preference), and `budget` (`gzipBytes` total, optional `perFileGzipBytes`, `fpsCap` or `null`, `pausesOffscreen`).
2. Any file that calls `getContext('webgl...')` must contain an `IntersectionObserver` or `visibilitychange` pause, and a frame cap when `fpsCap` is set.
3. Size is the comment-free transpiled gzip, the same measure as `motion-budget.test.ts`, so a passing budget is an upper bound on what the build ships.
4. Run `node scripts/invariants/art-direction/run.mjs` and `node --test scripts/invariants/art-direction/surface-media.test.mjs`. An unregistered canvas, WebGL or video file under the marketing roots lands on the shrink-only baseline, which cannot grow.
5. Add the budget to `motion-budget.test.ts` if the file is new, and a Storybook story if you add UI.
6. Any WebGL context or canvas animation loop also needs an entry in `apps/web/data/marketing/animatedBackgroundBudget.ts`: `maxRenderMsPerFrame` <= 2, `defaultEnabled: false` (static poster by default), and a `reducedMotionFallback` file that reads `prefers-reduced-motion`. `apps/web/tests/unit/marketing/animated-background-budget.test.ts` enforces it.

Known gap: a `requestAnimationFrame` loop with no canvas or GL (for example `ArtistProfileMonetizationSection.tsx`) is not yet detected by the registry check. Adding that detection needs a baseline entry and a reviewed decision on that file.
