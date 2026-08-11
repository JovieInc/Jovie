# Renderer Targets

Status: **Draft (research lane)** · Owner: Gem · Updated 2026-08-10

One card contract, many targets. The channel changes only the **presentation
skin**, never the **data**. This document defines the renderer targets and the
rules for each.

## 0. Principle

- **Single source of truth = `CardData`** (bound live data + renderHash).
- Renderers are pure: `CardData → target artifact`. No renderer may compute,
  fetch, or fabricate data — it only lays out pre-validated `CardData`.
- All renderers share the same `CardContract` and the same viewer-facing content.

## 1. Target id registry

```ts
type CardTargetId =
  | 'png'            // deterministic PNG image attachment (iMessage/web)
  | 'html'           // interactive HTML (web/Jovie UI, console dashboard)
  | 'imessage_text'  // human-readable text for iMessage (attachment + sentence)
  | 'telegram_text'  // Telegram-safe plain text (no HTML-heavy markup)
  | 'web'            // React component in the web/Jovie UI
  | 'future'         // reserved for future channels
```

## 2. PNG / image attachment target

**Canonical pattern:** extend the existing **ImageResponse** edge renderer at
`apps/web/lib/share/*` (`story-renderers.tsx`, `story-layout.tsx`,
`image-utils.ts`). Do not introduce a new renderer stack.

- Deterministic: same `CardData` → same bytes. Fonts bundled (Satoshi /
  Source Serif), no network font fetch at render time.
- Aspect ratios: hero/metric cards ~ square-ish (e.g. 1080×1350) or 1200×750;
  trend cards 1200×630 (OG-safe) or 1080×1080. Exact sizes are constants in one
  place (mirror `STORY_SIZE` / `OG_SIZE` in `image-utils.ts`).
- Theme: Noir Ion dark-first tokens (canvas `#030407`, card `#0f1420`, ivory
  text, electric-blue Ion accent `#11afff`).
- **Data hygiene:** any remote image (e.g. product image) is embedded via
  `toDataUrl` (timeout + size-capped, `image-utils.ts`); on failure the layout
  degrades gracefully (placeholder box), it never fails the whole card.
- **Delete-after-send:** transient iMessage/Telegram PNG artifacts are deleted
  after sending (keep at most the current one; a saved HTML template is durable,
  not a growing pile of PNGs). See `cos-comms-style`.

### New shared card components (PNG)

- `CardShell` (subset of `StoryLayout`): dark bg, branding, content slot, footer.
- `HeroCard` renderer (hero value + stat rows + footer).
- `TrendCard` renderer (chart + legend + unit).
- `ProductCard` renderer (image/title/price/merchant/URL).
- `StatusCard` renderer (status strip).

## 3. HTML / web target

- **Web/Jovie UI:** React component(s) that render `CardData` directly, using
  the design system (`packages/ui`, `design.tokens.json` tokens). Same layout as
  the PNG but interactive (link out, tooltips).
- **Console dashboard:** extend the `apps/console/lib/render-dashboard.ts`
  HTML-string pattern where a dashboard surface needs a lightweight,
  agent-renderable HTML card.
- The HTML target is the natural home for `table` / `composition` cards (grid).

## 4. Text target (iMessage + Telegram-safe)

- **Human-readable, voice-clean.** Never surface ISO/RFC timestamps, epoch
  numbers, or raw JSON to the user. Render timestamps as "Aug 10, 9:15am" or
  "just now / 5 min ago".
- **iMessage editorial card rule:** the card image is the attachment; the
  message is a short human sentence. One hero number, a few stat rows, a footer.
- **Telegram-safe:** plain text, no HTML-heavy markup, no Ansi color codes.
  Prefer simple number + unit + emoji in a table over prose rows.
- Example text skin for a shipping hero:

```
Shipping today ✅
Merged: 18   (+3 vs yesterday)
Open PRs: 12
MQ entries: 2
Gem-attributed today: 7
As of Aug 10, 9:15am pt · Jovie ops
```

- **No blank/cron noise.** On iMessage, a card is only attached when it adds
  value to a message Tim asked for or a decision/P0. Cron defaults to
  `deliver=local`; only time-sensitive founder decisions ping the chat.

## 5. Target rules matrix

| Target | Renderer | Deterministic | No-default guard | Delete-after-send | Human-readable |
|--------|----------|---------------|------------------|-------------------|----------------|
| `png` | ImageResponse | yes | yes (fail closed) | yes (transient) | labels/values |
| `html` | React / console | yes | yes | n/a (durable) | labels/values |
| `imessage_text` | text skin | yes | yes (fail to human text) | n/a | strict |
| `telegram_text` | text skin | yes | yes | n/a | strict |
| `web` | React | yes | yes | n/a | labels |

## 6. Delivery rules (coordination)

- Delivery is **separate from rendering** — a `CardRenderer` produces artifacts;
  a `CardDeliverer` decides channel, attaches, and (for transient) deletes.
- iMessage: useful human-written text + attachment only. No blank messages.
- Telegram: minimal; backup channel. One-line summary preferred over multi-block.
- Web/console: durable, no deletion.
- Never deliver a card that failed the no-default guard; fail to short human
  text on personal channels.