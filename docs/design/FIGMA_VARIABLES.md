# Figma variables

Figma is the canonical design canvas (remote MCP, multiplayer agents). Code
tokens stay the source of truth. Figma variables are generated from them, and
Figma frames come back into code 1:1.

```text
design-system.css + ziawi-color-sot.json  ->  docs/design/figma/generated/{light,dark}.tokens.json  ->  Figma variables
Figma frames  ->  code components, mirrored 1:1 by hand
```

Homepage headline stays locked: **Be found. Be understood.**

## Export (code -> Figma)

```bash
pnpm design:tokens-export         # write docs/design/figma/generated/light.tokens.json and dark.tokens.json
pnpm design:tokens-export:check   # CI: stale files, off-palette colors, Figma drift
```

- Format: W3C DTCG JSON, one file per mode. Figma's Variables import reads it
  natively. Import both files so light and dark become modes of one collection.
- Colors are the semantic palette only, 25 variables: 5 elevations (canvas,
  shell, card, elevated, floating), text primary/secondary/tertiary/disabled,
  border subtle/default/strong/focus, and the six-accent pack (ion, ultra,
  pulse, mint, orange, red) each with its `-soft` value. The list is read from
  `apps/web/design/ziawi-color-sot.json`; text and border roles are in
  `scripts/design/design-token-export.mjs`.
- Not exported, kept internal: aliases (bg-base, bg-page, surface0-3, glass,
  text-quaternary, aqua, gold, flare), status colors (success, warning and error
  are mint, orange and red), selected, focus-ring, and anything else.
- Dimensions (space, text size, radius, row heights, grid) are exported in both
  files. Grid tokens for the DataGrid: `grid/row-compact` 36, `grid/row-default`
  (alias of `size/row/compact`, 40), `grid/row-comfortable` (alias of
  `size/row/list`, 44), `grid/cell-padding-x` 12, `grid/avatar` 24 and
  `grid/status-dot` 8.
- Names are slash paths with no `color/` prefix: `surface/canvas`,
  `text/primary`, `border/subtle`, `accent/ion`, `radius/sm`. The nested DTCG
  groups produce exactly these.
- Values are read from `design-system.css` per mode. Hex alpha is 8-bit.
- Never edit Figma variables by hand. Change the code token and re-export.

## The Figma file

The file key is not committed. It lives in the `JOVIE_FIGMA_FILE_KEY`
environment variable (and in agents' project memory); the snapshot names that
variable in `figmaFileKeyEnv`. The file has the variable collection
"Jovie tokens" (`VariableCollectionId:1:3`) with a Dark mode.

## Drift check (Figma -> CI)

CI holds no Figma token and has no secret. It compares the code export with a
committed snapshot of the Figma file's variables:
`docs/design/figma/figma-variables.snapshot.json`.

Agents refresh the snapshot through the Figma MCP (`get_variable_defs` on the
Tokens board), then commit it. Shape:

```json
{
  "$schema": "jovie-figma-variables-snapshot/v1",
  "figmaFileKeyEnv": "JOVIE_FIGMA_FILE_KEY",
  "capturedAt": "<ISO time>",
  "modes": ["dark"],
  "variables": {
    "surface/canvas": { "type": "color", "values": { "dark": "#030406" } },
    "space/4": { "type": "float", "values": { "dark": 4 } }
  }
}
```

Until a real snapshot lands (`variables` empty) the check
prints "no Figma snapshot yet" and passes. Once it exists, a variable that is
extra in Figma or has a different value fails the check. Only the modes listed
in `modes` are compared, and code variables not in Figma yet (light mode, space,
text sizes, size/*, radius none and pill) are warnings, not failures.

## Frames back into code

Figma frames are the design reference for component structure. Code components
mirror them 1:1, by hand. Never write Figma variables back into code tokens.
