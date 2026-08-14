/**
 * Cover vs thumbnail are opposites. Rules stolen from Recoup
 * recoup-content-make-graphics (2026-08-14) — taxonomy only, no HTTP
 * analyze-gate, hooks, or generation pipeline.
 */

import type {
  PackagingArtReadiness,
  PackagingEvidenceTier,
  PackagingFinding,
  PackagingLlmOutput,
} from './types';

export const PACKAGING_FORMAT_SPLIT_RULES = `FORMAT-SPLIT — cover and thumbnail are opposites on purpose. Pick the format, then obey only that format's rule.
COVER / album art: 1:1, ≥3000px, RGB, no URLs, no hooky text. Must still read at ~120px. Respect the square. Never crop (object-fit: contain, not cover).
THUMBNAIL: 16:9 / 1280×720. One focal face if a face is present. Hook words off the face. Never overlay a face or a person. Headline variants stay ≤3 words (do not raise to 5).`;

export const PACKAGING_FOUNDER_LOCK = `FOUNDER LOCK — never fuck with art, never cover a face. Do not recommend gradients, chrome, play buttons, or text on a face.`;

export const PACKAGING_ANALYZE_GATE = `ANALYZE-GATE — you cannot see pixels unless a visual observation was actually recorded this run. A thumbnail URL or a correct size/format is not evidence the content is good. If no rendered image was inspected (no thumbnail URL / no visual observation), every visual finding's evidenceTier is unknown (platform_spec only for spec-only rows). Do not claim the art is ready, good, or done.`;

export const PACKAGING_RULE_CASE_IDS = [
  'hook-text-on-face',
  'cover-with-hook-text',
  'no-image-unknown',
  'cover-vs-thumb',
] as const;

export type PackagingRuleCaseId = (typeof PACKAGING_RULE_CASE_IDS)[number];

export type PackagingRuleCaseResult = {
  readonly id: PackagingRuleCaseId;
  readonly passed: boolean;
  readonly reason: string;
};

const HOOK_ON_FACE_PATTERN =
  /\b((text|hook|words?|type|title)[\s\S]{0,40}(on|across|over|onto)[\s\S]{0,24}(face|person)|(put|add|overlay)[\s\S]{0,40}(on|across|over|onto)[\s\S]{0,24}(face|person))\b/i;
const ADDS_HOOKY_COVER_PATTERN =
  /\b(add|put|overlay|include)\b[\s\S]{0,48}\b(hooky text|hook text|hook|stream now|out now|new music|subscribe)\b/i;
const FORBIDDEN_TREATMENT_PATTERN =
  /\b(gradients?|chrome|play buttons?|text on (a )?face)\b/i;
const COVER_CROP_PATTERN =
  /\b(object-fit:\s*cover|crop (the )?(square|cover|art))\b/i;
const READY_CLAIM_PATTERN =
  /\b(ready|done|good to go|looks good|art is good|final)\b/i;
const VISUAL_SURFACE = new Set(['cover', 'thumbnail', 'channel_art']);
const VISUAL_OBSERVATION_PATTERN =
  /\b(thumb|cover|art|image|pixel|face|overlay|crop)\b/i;

export function recommendationIsRefused(
  format: 'cover' | 'thumbnail',
  recommendation: string
): boolean {
  const text = recommendation.trim();
  if (!text) return true;
  if (FORBIDDEN_TREATMENT_PATTERN.test(text)) return true;
  if (format === 'thumbnail' && HOOK_ON_FACE_PATTERN.test(text)) return true;
  if (format === 'cover' && ADDS_HOOKY_COVER_PATTERN.test(text)) return true;
  if (format === 'cover' && COVER_CROP_PATTERN.test(text)) return true;
  return false;
}

export function isVisualPackagingFinding(finding: PackagingFinding): boolean {
  if (VISUAL_SURFACE.has(finding.surface)) return true;
  return VISUAL_OBSERVATION_PATTERN.test(finding.observation);
}

export function stripReadyClaims(text: string): string {
  if (!READY_CLAIM_PATTERN.test(text)) return text;
  return 'Do not assert the art is finished without a pixel inspection.';
}

export function applyPackagingAnalyzeGate(input: {
  readonly output: PackagingLlmOutput;
  readonly pixelsInspected: boolean;
}): PackagingLlmOutput {
  const artReadiness: PackagingArtReadiness = input.pixelsInspected
    ? 'needs_work'
    : 'uninspected';
  const findings = input.output.findings.map(finding => {
    if (input.pixelsInspected || !isVisualPackagingFinding(finding)) {
      return {
        ...finding,
        recommendation: stripReadyClaims(finding.recommendation),
      };
    }
    const evidenceTier: PackagingEvidenceTier =
      finding.evidenceTier === 'platform_spec' ? 'platform_spec' : 'unknown';
    return {
      ...finding,
      evidenceTier,
      recommendation: stripReadyClaims(finding.recommendation),
    };
  });

  return {
    ...input.output,
    findings,
    pixelsInspected: input.pixelsInspected,
    artReadiness,
  };
}

export function evaluatePackagingRuleCase(
  id: PackagingRuleCaseId
): PackagingRuleCaseResult {
  switch (id) {
    case 'hook-text-on-face': {
      const refused = recommendationIsRefused(
        'thumbnail',
        'Put NEW MUSIC across the face'
      );
      const allowed = !recommendationIsRefused(
        'thumbnail',
        'Two-word hook in the safe margin; face uncovered'
      );
      return {
        id,
        passed: refused && allowed,
        reason: refused
          ? allowed
            ? 'Hook text on a face is refused; off-face hook is allowed'
            : 'Off-face hook was incorrectly refused'
          : 'Hook text on a face was not refused',
      };
    }
    case 'cover-with-hook-text': {
      const refused = recommendationIsRefused(
        'cover',
        'Add STREAM NOW hooky text on the cover'
      );
      const allowed = !recommendationIsRefused(
        'cover',
        'Keep the square, no hooky text, object-fit: contain, readable at 120px'
      );
      return {
        id,
        passed: refused && allowed,
        reason: refused
          ? allowed
            ? 'Cover hooky text is refused; square contain is allowed'
            : 'Valid cover rule was incorrectly refused'
          : 'Cover hooky text was not refused',
      };
    }
    case 'no-image-unknown': {
      const gated = applyPackagingAnalyzeGate({
        pixelsInspected: false,
        output: {
          transcriptSummary: 'No pixels inspected.',
          promise: {
            title: 'Unknown',
            thumbnail: 'Unknown',
            combined: 'Unknown',
          },
          niche: {
            label: 'Other',
            category: 'other',
            confidence: 0,
            rationale: 'No visual observation.',
          },
          first30sDeliversPromise: false,
          first30sAssessment: 'No transcript.',
          findings: [
            {
              surface: 'thumbnail',
              observation: 'Thumbnail looks finished.',
              evidence: 'No rendered image was inspected.',
              evidenceTier: 'observed',
              recommendation: 'Art is ready.',
            },
            {
              surface: 'cover',
              observation: 'Cover should be 3000×3000 JPG RGB.',
              evidence: 'Platform spec.',
              evidenceTier: 'platform_spec',
              recommendation: 'Keep the square; object-fit: contain.',
            },
          ],
          thumbnailVariants: [
            {
              headline: 'Stay close',
              wordCount: 2,
              concept: 'Face clear, two-word hook off the face.',
              mobileLegible: true,
              hookOffFace: true,
              coversFace: false,
            },
            {
              headline: 'Night drive',
              wordCount: 2,
              concept: 'One focal face, hook in the margin.',
              mobileLegible: true,
              hookOffFace: true,
              coversFace: false,
            },
          ],
          safeZone: {
            thumbnail1280x720: 'unknown',
            channelArt2560x1440Safe1546x423: 'unknown',
            cover3000x3000JpgRgbNoUrls: 'unknown',
            notes: 'No pixels inspected.',
          },
          pixelsInspected: true,
          artReadiness: 'needs_work',
        },
      });
      const visual = gated.findings[0];
      const spec = gated.findings[1];
      const passed =
        gated.pixelsInspected === false &&
        gated.artReadiness === 'uninspected' &&
        visual?.evidenceTier === 'unknown' &&
        !READY_CLAIM_PATTERN.test(visual.recommendation) &&
        spec?.evidenceTier === 'platform_spec';
      return {
        id,
        passed,
        reason: passed
          ? 'No-image run marks visual findings unknown and will not claim ready'
          : 'No-image analyze-gate did not downgrade visual findings or strip ready',
      };
    }
    case 'cover-vs-thumb': {
      const coverForbidsHook = recommendationIsRefused(
        'cover',
        'Add a three-word hook on the cover'
      );
      const thumbAllowsOffFaceHook = !recommendationIsRefused(
        'thumbnail',
        'Three-word hook off the face on 16:9 / 1280×720'
      );
      const coverForbidsCrop = recommendationIsRefused(
        'cover',
        'Crop the square with object-fit: cover'
      );
      const thumbForbidsFaceOverlay = recommendationIsRefused(
        'thumbnail',
        'Overlay hook words on the person'
      );
      const passed =
        coverForbidsHook &&
        thumbAllowsOffFaceHook &&
        coverForbidsCrop &&
        thumbForbidsFaceOverlay;
      return {
        id,
        passed,
        reason: passed
          ? 'Cover forbids hooky text and crop; thumbnail keeps off-face hook'
          : 'Cover vs thumbnail opposite rules were not honored',
      };
    }
  }
}

export function evaluateAllPackagingRuleCases(): PackagingRuleCaseResult[] {
  return PACKAGING_RULE_CASE_IDS.map(evaluatePackagingRuleCase);
}
