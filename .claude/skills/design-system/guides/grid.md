# Grid discipline

A grid you can't measure is a mood board. Use this guide when you build or change a page, section or spread that lays out on columns, or when you judge alignment. Distilled from Müller-Brockmann grid practice. The look is not borrowed: Jovie stays matte, dark and near-monochrome, so take the method and leave the Swiss palette and type.

Already owned elsewhere, so not repeated here: the 4px beat and `--space-*` (`DESIGN.md` spacing, [tokens.md](tokens.md)), icon and text centering (`DESIGN.md` Icon and Text Alignment), logo ink bounds (`DESIGN.md` logo normalization), and the relational-grid and optical-grid tests in CI (`evaluateRelationalGrid` in `scripts/component-rendered-invariant-policy.mjs`, `apps/web/scripts/optical-grid-scanners.ts`).

## Rules

1. **One source of truth.** Columns, gutter, margin, baseline and max width are tokens or CSS variables defined once per surface. Content and any debug overlay read the same values. No raw numbers in either.
2. **Overlay and content share one box.** A column overlay that is a full-width sibling of a centered max-width container drifts apart above max width. Put the overlay inside the same content box, with the same column count and gap.
3. **Place by column line.** Section bands span the full row and use `grid-template-columns: subgrid`, with a plain repeat fallback under `@supports not`. Children take `grid-column: start / end`. Do not pad or offset copy to fake a column.
4. **Lock vertical rhythm to a baseline.** Display type gets a px line-height that is a whole multiple of the baseline, not a unitless one. Margins, padding and media heights are baseline multiples so tops and bottoms land on lines. The baseline is the 4px beat; pick a leading that is a multiple of it.
5. **Align the ink, not the box.** Large glyphs have a left side-bearing, so a box on the line still looks off. For display type, after `document.fonts.ready` and on resize, measure the first glyph with canvas `measureText(ch).actualBoundingBoxLeft` using the element's computed font, and shift by that amount. Side-bearing is per font: measure the real loaded font, never a fallback. Put the correction in the shared display primitive, never at a call site (same rule as icon optical correction).
6. **Verify at more than one width**, at least one above and one below max width. Check, within about 0px:
   - every band child's left edge is on a column start and its right edge on a column end (build both sets; "to line N" ends across the gutter)
   - each overlay column rect equals the computed column rect
   - text tops modulo the baseline are about 0 (half a baseline tolerance)
   - each display element's ink-left sits on its own column-start line
   Measure with the real font loaded. A fallback font gives a valid-looking wrong answer.
7. **Evidence is a zoomed crop.** Put a top-left crop with the overlay on in the PR, next to the numbers. Dark and light.

## Not adopted

White paper, Swiss red, Helvetica and grotesque-only type, "avoid the cream look", and 12 columns plus 8px as a fixed default. Jovie's palette, type and spacing come from `design.tokens.json` and `DESIGN.md`. Use the columns the surface already has.

## Follow-up (not built)

Asserting ink-left and baseline modulo in the existing rendered grid check is tracked in Linear (see the PR body). Until it exists, rule 6 is a manual check for new column layouts, with the numbers in the PR.
