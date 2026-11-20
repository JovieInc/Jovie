<!--
spec-version: 1.0.0
doc-freshness: docs/marketing/IMAGERY.md
-->
# Landing Imagery

> Tim (2026-10-29): agents must make landing pages look like a design team
> touched them, not an engineer built them. That is mostly imagery. This is
> the one imagery spec. It extends, and never replaces, `canon/MARKETING.md`
> (Imagery and color), `docs/marketing/DESIGN_INVARIANTS.md` (MKT-D17, MKT-D19)
> and `DESIGN.md`. Agents run the pipeline in
> `.claude/skills/design-system/SKILL.md` (Landing imagery).

## Sources this spec comes from

| Source | What it owns here |
|---|---|
| `canon/MARKETING.md` Imagery and color; `apps/web/data/marketing/imageColorPolicy.ts` | one accent per image and section (Ion, Ultra, Pulse), lit wedge, rest to neutral black, no orange |
| MKT-D17, MKT-D19 | rounded media, single accent |
| `apps/web/data/marketing/factory/mediaDecision.ts` (JOV-7250) | medium per section, sourcing order; product UI is captured, never generated |
| `scripts/invariants/art-direction/` (`images`, `people`, `product-shots`, `surface-media`) | smoothness, hue and sidecar checks, approved people, shot freshness |
| `docs/design-system/marketing-critic-rubric.json` | the red-case classes a critic flags (wallpaper-bg, no-focal-point, dead-space, mis-scaled-mockup, text-on-art-duplicate) |
| Pen: `Jovie Design Studio — canonical.lib.pen` | feature bento (`I8TdQv`), share sheet (`YKKeE`), phone profile (`WyQJb`); Pen is where art direction happens, tokens stay in code |
| Tim's memory rules `feedback_{no_music_cliche_imagery, approved_people_only, no_text_on_text, matte_subtle_color, linear_precision_luxury}` | the bans and the bar below |

## 1. Composition

1. **One subject.** Each image has one focal point. A second competing visual fails `no-focal-point`.
2. **Crop to the moment.** Show the one element that makes the claim (a field, a card, a sheet), never the page shrunk down. A shot crops to the union of the elements that make the moment, plus measured padding with optically balanced sides.
3. **Readable by construction.** Effective text size on the page is at least 11px (captured text size times display scale). Below that, crop tighter or capture the real mobile layout. This is checked, not judged.
4. **Device frames are exact.** A UI shot inside a bezel or frame has the frame screen's aspect ratio (1% tolerance) and fills it. Never letterbox, never shrink to fit.
5. **Depth.** At most three layers: plate (back), hero shot (mid), one supporting fragment (front, smaller, offset). Depth comes from scale contrast and tonal shadow steps, not blur, tilt or glass.
6. **Scale contrast.** Pair one large crop with one small fragment. All-medium layouts read as a template. Bleed one edge off the frame to imply a larger surface.
7. **Negative space.** Roughly half the stage is quiet near-black. The headline and CTA own a declared quiet zone; imagery never enters it. No band of empty page taller than half a viewport.
8. **Grid.** Edges land on the 4px beat and the section grid; sibling cards share equal heights and aligned top edges; optical margins are balanced (top and bottom within 2px of each other). Misalignment reads cheap and is machine-checked in CI.
9. **Rounded and hairline.** Radius from `--radius-*`, 1px hairline from `--color-border-subtle`. Frames and radius are CSS, never baked into pixels.

## 2. Light and material

- **Matte.** Near-black surfaces, depth from tonal steps and soft shadow. No specular glass shine, no glossy gradient, no noisy hero, no animated or looping background.
- **Near-monochrome.** Color is an accent: one thin line, one lit wedge, or one small glow. One hue per image and per section (Ion, Ultra or Pulse). Never wallpaper, never two hues.
- **Light is single-source.** One lit wedge from one corner; everything else falls off to neutral black. Texture is fine grain, grid lines or edge-light lines, felt rather than seen.
- **Plates are smooth.** Generated plates pass the smoothness and hue gates in `images.mjs` and declare an accent in their sidecar.

## 3. Real UI versus abstract

| Need | Use | Source |
|---|---|---|
| Prove a product claim | Real UI shot, cropped to the moment | rendered from the live component with canary data (`ProductShot`) |
| Give the shot a world | Plate behind it | generated abstract plate (no text, no people, no objects) |
| Section with nothing real to show | Typography, or an abstract plate alone | never a fake UI, never a placeholder |
| People | Nothing, by default | only people in `approved-people.json` (today: Tim, and not on the homepage) |

Product UI is rendered, never mocked and never generated. A generated image of an interface is a hard failure (`kind: "generated-ui"`).

## 4. Banned

- Full-viewport raw screenshots, or a CSS `scale()` or `translate` crop of one.
- Music clichés: microphones, headphones, DJ decks, vinyl, guitars, stages, crowds with phones, generic waveform stock.
- People who are not approved; stock, generated or library portraits; the P01-P12 Pen portraits.
- Text over text: UI copy on artwork that has its own text. Square art, caption below.
- Icon-in-tile decoration, orange, mixed hues, animated purple WebGL backgrounds, consumer oversized-everything type.
- Any hero or feature image that did not come out of the pipeline (guard: `imagery-provenance`).

## 5. References to aim for

Descriptions are of the live pages as of 2026-10; refresh the captures with `pnpm --filter web design-refs pull --surface marketing` before copying anything. Adopt the technique, never the identity (benchmark-library rule).

| # | Reference | Technique to take | Why it works |
|---|---|---|---|
| 1 | Linear home hero (linear.app) | the real issue list, oversized, bleeding off the right and bottom edge on near-black | scale and bleed make the product the subject; one hairline-bordered surface, no decoration |
| 2 | Linear feature sections (linear.app/features) | one UI fragment per feature (a menu, a modal, a command bar), not a screen | the crop is the claim; text size stays readable |
| 3 | Linear changelog entries | each entry leads with a tight 16:9 crop of just the changed UI | consistent ratio and radius make a list of images feel designed |
| 4 | Raycast home hero (raycast.com) | the real command bar large and centered, key chips beside it | the product is the hero and the quiet space around it carries the weight |
| 5 | Raycast extension and AI sections | one window layered over a second, smaller one | depth from overlap and scale, no tilt |
| 6 | Apple iPhone product pages (apple.com/iphone) | one object on black, a full view then a macro crop | extreme scale contrast, single light direction, everything else dark |
| 7 | Apple Music and Maps feature pages | a screen cropped by the bottom edge of the frame | the cut implies more content and keeps the focus on the top of the UI |
| 8 | Frame.io home (frame.io) | review player with a comment thread, real frames as content | editorial spacing; the UI is shown in use with true content |
| 9 | Frame.io feature sections | a UI card overlapping a media frame at one corner | layered depth with a clear front and back, and aligned edges |
| 10 | Vercel home hero (vercel.com) | fine grid plus one prism-like light edge on black | an abstract plate that is precise and quiet; the only color is a thin accent |
| 11 | Vercel feature sections | a dashboard crop masked to fade into the page at one edge | the fade removes the screenshot border so it merges with the page |
| 12 | Vercel Ship and Next.js Conf pages | edge-light lines and grain over pure black | texture felt, not seen; supports type without competing with it |

## 6. How it is enforced

Spec to pipeline to guard, so nothing here rests on remembering it: shots and stages are rendered by the pipeline (`ProductShot`, `ImageryStage`), the geometry and 11px rules fail in `scripts/invariants/art-direction/product-shots.mjs`, plates fail in `images.mjs`, every asset needs a passing cold-screenshot and dogfood-judge verdict, and `imagery-provenance` fails a marketing page whose hero or feature images did not come from the pipeline (shrink-only ratchet).
