/**
 * The one visual defect checklist (JOV-14354). Every "does this screenshot
 * look broken" reviewer imports this: the fast local check an agent runs
 * before push, the two-judge jury on Visual Regression captures, and the
 * baseline-refresh gate. Change a rule here and every tier changes with it.
 *
 * It finds objective defects, not taste. Taste goes through design-taste-jury.
 */

export const DEFECT_CATEGORIES = [
  'affordance-no-behavior',
  'empty-or-duplicated',
  'clipped-text',
  'misalignment',
  'stray-line',
  'focus-ring',
  'color-rule',
  'other',
] as const;

export type DefectCategory = (typeof DEFECT_CATEGORIES)[number];

export const DEFECT_SEVERITIES = ['low', 'medium', 'high'] as const;
export type DefectSeverity = (typeof DEFECT_SEVERITIES)[number];

export interface DefectRule {
  readonly category: Exclude<DefectCategory, 'other'>;
  readonly title: string;
  readonly look: string;
}

export const DEFECT_CHECKLIST: readonly DefectRule[] = [
  {
    category: 'affordance-no-behavior',
    title: 'Affordance with no behavior',
    look: 'A chevron, caret, disclosure arrow or menu trigger with nothing it could open (a section header with a down arrow and no items under it); a badge or count showing 0; a button or link that looks clickable but plainly is not.',
  },
  {
    category: 'empty-or-duplicated',
    title: 'Empty or duplicated element',
    look: 'An empty container or card, a header with no content under it, a repeated element, a placeholder that never filled.',
  },
  {
    category: 'clipped-text',
    title: 'Clipped or overflowing text',
    look: 'Text truncated, overlapping or cut off by its container or the viewport.',
  },
  {
    category: 'misalignment',
    title: 'Misalignment',
    look: 'Elements that should line up but do not; uneven gutters or inconsistent spacing between siblings.',
  },
  {
    category: 'stray-line',
    title: 'Stray line or border',
    look: 'A stray border, divider, outline or double line.',
  },
  {
    category: 'focus-ring',
    title: 'Focus ring after a mouse click',
    look: 'A focus ring on an element that was only clicked with a mouse, not tabbed to.',
  },
  {
    category: 'color-rule',
    title: 'Color rule break',
    look: 'Jovie is a monochrome world. Accent color may appear only as a thin light (hairline, dot, glow edge). Flag a filled accent block (solid colored button or banner) and any two-tone gradient.',
  },
];

export interface DefectFinding {
  readonly category: DefectCategory;
  readonly finding: string;
  readonly severity: DefectSeverity;
  /** 0-1: how sure the reviewer is that this is a real defect. */
  readonly confidence: number;
  /** [x, y, width, height] in image pixels, when the reviewer located it. */
  readonly bbox?: readonly [number, number, number, number];
}

/** A finding blocks only when it is both severe and sure. */
export const BLOCK_MIN_CONFIDENCE = 0.8;

export function isBlockingFinding(
  finding: Pick<DefectFinding, 'severity' | 'confidence'>,
  minConfidence: number = BLOCK_MIN_CONFIDENCE
): boolean {
  return finding.severity === 'high' && finding.confidence >= minConfidence;
}

/** Bumped when the rules change, so caches keyed on it invalidate. */
export const CHECKLIST_VERSION = '1';

export function buildDefectSystemPrompt(): string {
  return 'You are a meticulous visual QA reviewer. You look only at what is visible in the screenshot and report real, visible defects, never taste. When unsure, lower the confidence instead of guessing.';
}

export function buildDefectPrompt(context?: string): string {
  const rules = DEFECT_CHECKLIST.map(
    (rule, index) => `${index + 1}. ${rule.category}: ${rule.look}`
  ).join('\n');
  return [
    'Review this screenshot for visible defects.',
    context ? `Context: ${context}` : null,
    '',
    'Check for:',
    rules,
    '',
    'Do not flag fixture data, or skeleton loaders that are plainly still loading.',
    'severity "high" means a user would plainly see a bug.',
    '',
    `Answer ONLY with minified JSON: {"findings":[{"category":"${DEFECT_CATEGORIES.join('|')}","finding":"one sentence naming the element and what is wrong","severity":"low|medium|high","confidence":0.0-1.0,"bbox":[x,y,width,height]}]}`,
    'bbox is optional. Use {"findings":[]} when the screenshot is clean.',
  ]
    .filter(line => line !== null)
    .join('\n');
}

const MAX_FINDINGS = 8;

/** Null when the reply is not the expected JSON; [] for a clean reply. */
export function parseDefectFindings(text: string): DefectFinding[] | null {
  const match = /\{[\s\S]*\}/u.exec(text ?? '');
  if (!match) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return null;
  }
  const raw = (parsed as { findings?: unknown }).findings;
  if (!Array.isArray(raw)) return null;
  const out: DefectFinding[] = [];
  for (const item of raw.slice(0, MAX_FINDINGS)) {
    if (!item || typeof item.finding !== 'string') continue;
    const confidence = Number(item.confidence);
    const category = (DEFECT_CATEGORIES as readonly string[]).includes(
      item.category
    )
      ? (item.category as DefectCategory)
      : 'other';
    const severity = (DEFECT_SEVERITIES as readonly string[]).includes(
      item.severity
    )
      ? (item.severity as DefectSeverity)
      : 'low';
    const bbox =
      Array.isArray(item.bbox) &&
      item.bbox.length === 4 &&
      item.bbox.every((n: unknown) => Number.isFinite(n))
        ? (item.bbox as [number, number, number, number])
        : undefined;
    out.push({
      category,
      finding: item.finding.replace(/\s+/gu, ' ').trim().slice(0, 300),
      severity,
      confidence: Number.isFinite(confidence)
        ? Math.min(1, Math.max(0, confidence))
        : 0,
      ...(bbox ? { bbox } : {}),
    });
  }
  return out;
}
