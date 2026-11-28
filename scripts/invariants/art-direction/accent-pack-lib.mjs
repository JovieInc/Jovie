/**
 * Accent pack detectors. Pure: source text in, violation ids out.
 *
 * Rules (contract: .claude/rules/ui.md "Accent pack"):
 *  a  off-pack color        off-pack-tailwind / off-pack-literal / off-pack-var
 *  b  two-tone gradient     two-tone-gradient
 *  c  rotation order        rotation-order, adjacent-accent
 *  d  one accent per item   multi-accent-item, multi-accent-file (heuristic)
 *  e  green/red min set     mint-red-min-set, mint-red-unguarded, rotation-helper-no-threshold
 *  f  equal weight          unequal-weight (heuristic)
 *  g  solid container fill  solid-accent-fill
 *
 * (d), (e), (f) and (g) are heuristics over a token stream. They aim to be
 * reviewable, not exact: every id names the file and the evidence.
 */
export * from './accent-pack-color.mjs';
export * from './accent-pack-detect-a.mjs';
export * from './accent-pack-detect-b.mjs';
export * from './accent-pack-tokens.mjs';
