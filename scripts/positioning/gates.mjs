// Positioning gates: pure, deterministic checks every variant passes before
// any persona sees it (canon/positioning-variants.json rule). A gate failure
// removes the variant from ranking; it never lowers a score.
//
//   truth   - vision is labeled as direction, MVP stated literally (POSITIONING.md
//             "Proof and claims guardrails"); no claim-like numbers in a line.
//   canon   - POSITIONING.md "Language to avoid" and retired lines.
//   price   - no prices in positioning lines: one price owner (offer truth).
//   slop    - @jovie/copy lint at the surface register (block findings fail).
//   length  - surface maxChars.
//   pivot   - an ICP outside allowedIcps is a pivot signal, not a candidate.

import { lintCopy } from '../../packages/copy/lint.ts';

/** POSITIONING.md "Language to avoid" + retired lines (v1.1 and P-2026-10-03 table). */
export const CANON_BANNED = Object.freeze([
  /\bAI (?:manager|artist)\b/i,
  /\bAI that runs your career\b/i,
  /\breplace your team\b/i,
  /\bdoes the work for you\b/i,
  /\bnever miss (?:an )?opportunit/i,
  /\bhandles everything\b/i,
  /\bpresence manager\b/i,
  /\brelease OS\b/i,
  /\blaunch platform\b/i,
  /\bcult\b/i,
  /\bleverage your fans\b/i,
  /\bmajor-label marketing\b/i,
  /\bsell out every show\b/i,
  // Pending proposal P-2026-10-03 lines may not appear externally until locked.
  /\bgather your people\b/i,
  /\bpeople before product\b/i,
]);

/** Words that make a line a claim about the future; such lines need a "today" anchor. */
const VISION_WORDS =
  /\b(?:building|careers?|operating system|OS|harness|every creator|where it's going)\b|\bnext:/i;
const TODAY_ANCHOR =
  /\b(?:today|starting with|we're building|where it's going)\b|\bnext:/i;
/** Claim-like numbers (subset of fundraising claims_lint NUM). */
const NUMBER =
  /\$\d|\b\d[\d,.]*\s?(?:%|[MK]\b|million|billion)|\b\d{1,3}(?:,\d{3})+\b|\b\d{2,}\+/;
const PRICE = /\$\s?\d|\bper month\b|\/mo\b|\bfree\b/i;

/**
 * @param {any} variant
 * @param {any} registry canon/positioning-variants.json
 * @returns {{ id: string, pass: boolean, pivotSignal: boolean, failures: string[], warnings: string[] }}
 */
export function gateVariant(variant, registry) {
  const failures = [];
  const warnings = [];
  const pivotSignal = !registry.allowedIcps.includes(variant.icp);
  if (pivotSignal)
    failures.push(
      `pivot: icp '${variant.icp}' not in allowedIcps; escalate to Tim`
    );

  const surfaces = Object.entries(registry.surfaces).filter(([, s]) => s.line);
  for (const [surfaceId, surface] of surfaces) {
    const text = variant.lines?.[surface.line];
    if (!text) {
      failures.push(`${surfaceId}: missing line '${surface.line}'`);
      continue;
    }
    if (surface.maxChars && text.length > surface.maxChars)
      failures.push(`${surfaceId}: ${text.length} chars > ${surface.maxChars}`);
    for (const pattern of CANON_BANNED)
      if (pattern.test(text))
        failures.push(`${surfaceId}: canon-banned ${pattern}`);
    if (NUMBER.test(text))
      failures.push(
        `${surfaceId}: claim-like number; positioning lines carry no traction or price figures`
      );
    if (PRICE.test(text))
      failures.push(
        `${surfaceId}: price wording; prices come only from ${registry.priceOwner}`
      );
    const lint = lintCopy(text, {
      register: surface.register,
      headline: surface.line !== 'what_building',
    });
    for (const finding of lint.findings) {
      const line = `${surfaceId}: copy ${finding.rule} '${finding.match}'`;
      if (finding.severity === 'block') failures.push(line);
      else warnings.push(line);
    }
  }

  // Truth: a vision-framed variant must name the vision AND anchor today's product.
  const hasVision = Boolean(variant.vision);
  for (const [key, text] of Object.entries(variant.lines ?? {})) {
    if (
      VISION_WORDS.test(text) &&
      !TODAY_ANCHOR.test(text) &&
      key !== 'one_liner'
    )
      failures.push(`truth: ${key} states direction without a 'today' anchor`);
  }
  if (hasVision && !TODAY_ANCHOR.test(variant.lines?.what_building ?? ''))
    failures.push(
      'truth: vision variant must label direction vs today in what_building'
    );
  if (!variant.mvp) failures.push('truth: missing literal mvp statement');

  return {
    id: variant.id,
    pass: failures.length === 0,
    pivotSignal,
    failures,
    warnings,
  };
}
