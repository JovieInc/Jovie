# JOV-1605 Screenshot Parity Ledger

This ledger is the canonical, screenshot-driven closeout checklist for remaining Linear parity gaps in shell, list, drawer, settings, loading, and nested-menu states.

## Source references

- Linear demo reference surface: https://linear.app/demo
- Linear refresh philosophy: https://linear.app/now/how-we-redesigned-the-linear-ui

## How to use this ledger

1. Keep one row per unresolved screenshot mismatch state.
2. Update `Jovie current` and `Exact delta` after each implementation pass.
3. Keep `Owner issue` set to a concrete Linear issue (never blank).
4. Mark `Status` as `✅ Closed` only when parity is visually verified in screenshots.
5. Do not remove closed rows; preserve as the final audit trail.

## Parity ledger (open mismatches)

| State group | State / scenario | Linear reference | Jovie current | Exact delta | Owner issue | Status |
|---|---|---|---|---|---|---|
| Shell | Global shell — desktop idle state | Linear demo shell frame with tight top bar rhythm and low-contrast dividers | Shell chrome appears heavier and uses stronger border contrast | Reduce shell separator emphasis, tighten header vertical rhythm by 4px, and normalize icon optical alignment in top bar | JOV-1606 | ⏳ Open |
| Shell | Global shell — keyboard focus traversal | Linear keyboard pass keeps visible but subtle ring hierarchy | Focus rings compete with nav accents on primary shell actions | Harmonize focus ring color and thickness hierarchy to keep focus visible without overpowering shell accents | JOV-1607 | ⏳ Open |
| List | Issue/list table — default density | Linear list rows present compact, scan-friendly rhythm | Row density is ~1 step taller with extra vertical padding in metadata lines | Reduce list row vertical spacing and align metadata baseline to match Linear reference density | JOV-1608 | ⏳ Open |
| List | Issue/list table — selected and hover states | Linear selected/hover states are distinct but restrained | Hover and selected surfaces are visually close, making active row state ambiguous | Increase selected-vs-hover contrast separation while preserving low-noise palette | JOV-1609 | ⏳ Open |
| Drawer | Right drawer — collapsed-to-open transition | Linear drawer opens with tight easing and no layout jump | Drawer intro animation feels slower and introduces subtle content shift | Retune easing/duration and remove initial content shift on open to match reference behavior | JOV-1610 | ⏳ Open |
| Drawer | Right drawer — section spacing and dividers | Linear drawer sections maintain consistent spacing cadence | Spacing cadence varies between sections; divider opacity is inconsistent | Normalize section spacing scale and unify divider opacity across drawer modules | JOV-1611 | ⏳ Open |
| Settings | Settings root — section hierarchy | Linear settings uses clear typographic hierarchy and lightweight helper text | Section heading weight and helper text contrast create flatter hierarchy | Rebalance heading weight/size and helper-text contrast for clearer scan order | JOV-1612 | ⏳ Open |
| Settings | Settings controls — toggles/inputs alignment | Linear controls share strict vertical alignment and label rhythm | Toggle and input label baselines drift between grouped settings rows | Standardize control row grid so labels, controls, and helper copy share one baseline system | JOV-1613 | ⏳ Open |
| Loading | Shell/list loading skeletons | Linear loading surfaces mirror final layout geometry closely | Skeleton geometry does not fully mirror final list layout at secondary text rows | Match skeleton line count/width/spacing to final row geometry and reduce shimmer prominence | JOV-1614 | ⏳ Open |
| Loading | Drawer/settings loading transitions | Linear loading handoff avoids abrupt content pop-in | Loading-to-ready transition pops in at full opacity without staged handoff | Add staged opacity handoff (skeleton → content) with brief overlap to reduce perceived pop | JOV-1615 | ⏳ Open |
| Nested menu | Nested menu — closed/open anchor alignment | Linear nested menus stay anchored with pixel-stable trigger alignment | Menu anchor drifts by a few pixels between default and open states | Lock trigger/menu anchor geometry to eliminate horizontal and vertical drift | JOV-1616 | ⏳ Open |
| Nested menu | Nested menu — keyboard and hover parity | Linear submenu behavior is identical for keyboard and pointer paths | Keyboard-opened submenu uses slightly different highlight cadence than hover-opened submenu | Unify highlight timing and active-item visuals across keyboard and pointer paths | JOV-1617 | ⏳ Open |

## Closeout checklist

- [ ] Every remaining screenshot mismatch has a row in the table above.
- [ ] Every row includes: Linear reference, Jovie current, exact delta, and owner issue.
- [ ] Each owner issue has an implementation PR linked back to this ledger.
- [ ] All rows are marked `✅ Closed` after screenshot verification.
- [ ] This file remains the canonical checklist until parity drain is complete.
