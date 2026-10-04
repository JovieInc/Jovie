# Jovie brand source

The Jovie O and wordmark, built from one parametric construction (JOV-7760).
Nothing here is drawn by hand: every outline, font, SVG and the construction
sheet comes from `font/construction.py`.

| Path | What it is |
|---|---|
| `font/construction.py` | The grid, the O, the five letters, optical spacing, pixel masters. |
| `apps/web/public/fonts/JovieWordmark-{Display,Text}.woff2` | The wordmark as a web font. Display for 24 px and up, Text below. The matching `.otf` for design tools is written to `dist/` and not tracked. |
| `font/sheet.py` | Renders `svg/construction-sheet.svg` from `dist/geometry.json`. |
| `dist/geometry.json` | Every number and outline, read by the sheet and by `@jovie/ui/brand`. |
| `svg/` | Static marks and wordmarks in ink, cream, black and white, plus the 16/24/32 px pixel-master marks. |

In the product, render the mark through `@jovie/ui/brand` (`JovieO`,
`JovieWordmark`), never from these files directly. The static SVGs are for
places without React: email, OG images, press kits.

## Regenerate

```sh
python3 -m venv .venv && .venv/bin/pip install -r packages/brand/font/requirements.txt
.venv/bin/python packages/brand/font/construction.py
.venv/bin/python packages/brand/font/sheet.py
pnpm exec biome format --write packages/brand/dist/geometry.json packages/ui/brand/geometry.gen.ts
```

Output is deterministic; a run with no source change leaves every file
byte-identical.
