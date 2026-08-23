/**
 * Shared caption typography for product shell atoms (Stat, ColumnLabel,
 * PerformanceCard title, CuesPanel, LyricsList).
 *
 * DESIGN.md Text Casing + `.claude/rules/ui.md` No AI-Slop: Title Case
 * labels with tracking-normal. Do not add tracked-caps eyebrows here —
 * the shell-caption style-guard fails closed on that pattern.
 */
export const SHELL_CAPTION_CLASSNAME =
  'text-3xs font-semibold tracking-normal text-quaternary-token';
