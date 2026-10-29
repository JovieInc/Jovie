/**
 * Vision critique for the presentation gate: the rendered implementation
 * against its Pen reference and the founder bans. Runs on the subscription
 * lane (scripts/vision/art-evaluator.mjs transport); no raw API keys.
 *
 * Blocking findings fail the gate. A transport failure fails closed.
 */
import { subscriptionVisionTransport } from '../vision/art-evaluator.mjs';

export const VISION_SCHEMA = 'design-present-vision/v1';
export const DEFAULT_VISION_MODEL = 'anthropic/sonnet';

export const VISION_CATEGORIES = Object.freeze([
  'misalignment',
  'pen-divergence',
  'ban-emoji',
  'ban-icon-tile',
  'ban-bordered-empty-card',
  'ban-oversized-tab',
  'dev-chrome',
  'clutter',
  'broken-layout',
]);

export function buildVisionPrompt({ title, scope }) {
  return [
    `Screen: ${title}. Image 1 is the Pen design (the target). Image 2 is the shipped implementation.`,
    `Judge only this region: ${scope}. Ignore the left sidebar. Ignore differences in sample data, counts, names, dates, artwork imagery and status-icon colour.`,
    'Alignment conventions: a pill control (tab, chip, button) aligns by its pill box, not its label; the label sits inset by the pill padding. Full-width rows, hairlines and table headers bleed to the content inset; their first text or glyph sits on the content edge.',
    'Report only defects a demanding product designer (Linear or Apple bar) would reject before showing the founder:',
    '- misalignment: an element in the content column not on the shared left edge, uneven gutters, a row visibly off the grid.',
    '- pen-divergence: a structural difference from the Pen design in layout, hierarchy, control treatment or empty-state anatomy (not data or copy).',
    '- ban-emoji, ban-icon-tile (an icon inside a filled or bordered tile), ban-bordered-empty-card, ban-oversized-tab.',
    '- dev-chrome: developer toolbars, badges or overlays.',
    '- clutter, broken-layout: overlap, clipping, stray plates, duplicated titles.',
    'severity is "blocking" only when the defect would make the founder reject the screenshot; otherwise "minor".',
    `Answer with JSON only: {"status":"pass"|"fail","findings":[{"category":one of ${JSON.stringify(VISION_CATEGORIES)},"severity":"blocking"|"minor","note":string}]}.`,
    'status is "fail" when any finding is blocking.',
  ].join('\n');
}

export function parseVisionVerdict(text) {
  const match = typeof text === 'string' ? text.match(/\{[\s\S]*\}/) : null;
  if (!match) throw new Error('vision: no JSON object in judge output');
  const verdict = JSON.parse(match[0]);
  if (
    !['pass', 'fail'].includes(verdict?.status) ||
    !Array.isArray(verdict.findings)
  )
    throw new Error('vision: verdict shape is invalid');
  const findings = verdict.findings.map(f => ({
    category: VISION_CATEGORIES.includes(f?.category) ? f.category : 'clutter',
    severity: f?.severity === 'blocking' ? 'blocking' : 'minor',
    note: String(f?.note ?? '').slice(0, 400),
  }));
  const blocking = findings.some(f => f.severity === 'blocking');
  return { status: blocking ? 'fail' : 'pass', findings };
}

export async function critiqueScreen(
  { title, scope, penPng, afterPng, model = DEFAULT_VISION_MODEL },
  transport = subscriptionVisionTransport()
) {
  const started = Date.now();
  try {
    const text = await transport({
      model,
      system:
        'You are a strict visual QA reviewer for Jovie product UI. Report only what is visible in the attached images. Answer with JSON and nothing else.',
      prompt: buildVisionPrompt({ title, scope }),
      images: [penPng, afterPng],
    });
    return {
      schema: VISION_SCHEMA,
      model,
      ...parseVisionVerdict(text),
      judgeMs: Date.now() - started,
    };
  } catch (error) {
    return {
      schema: VISION_SCHEMA,
      model,
      status: 'fail',
      findings: [],
      error: error instanceof Error ? error.message : String(error),
      judgeMs: Date.now() - started,
    };
  }
}
