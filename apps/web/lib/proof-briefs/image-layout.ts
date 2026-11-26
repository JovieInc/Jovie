import {
  type CertifiedProofBrief,
  ProofBriefError,
  proofBriefBrand,
  proofBriefProvenance,
} from './contract';

export const PROOF_BRIEF_IMAGE_SIZES = {
  landscape: { width: 1200, height: 630 },
  square: { width: 1080, height: 1080 },
  portrait: { width: 1080, height: 1350 },
} as const;
export type ProofBriefImageFormat = keyof typeof PROOF_BRIEF_IMAGE_SIZES;
export const PROOF_BRIEF_CARD_SIZE = PROOF_BRIEF_IMAGE_SIZES.landscape;

export function isProofBriefImageFormat(
  format: string
): format is ProofBriefImageFormat {
  return Object.hasOwn(PROOF_BRIEF_IMAGE_SIZES, format);
}

export const PROOF_BRIEF_TEXT_LIMITS = {
  heroValue: 16,
  heroLabel: 64,
  heroSentence: 90,
  pointValue: 16,
  pointLabel: 80,
  window: 40,
} as const;

export function clampProofBriefText(input: string, max: number): string {
  return input.length > max ? `${input.slice(0, max - 1).trimEnd()}…` : input;
}

// Unicode ranges in the bundled Satoshi Bold's cmap. Unsupported glyphs
// make next/og request fallback assets, which is unsuitable for a proof card.
const unsupportedSatoshiGlyph = new RegExp(
  '[^\\t\\n\\r' +
    '\\u0020-\\u007e\\u00a1-\\u00a9\\u00ab-\\u00ac\\u00ae-\\u00b9\\u00bb-\\u0123\\u0126-\\u012b\\u012e-\\u0131' +
    '\\u0134-\\u0137\\u0139-\\u0148\\u014a-\\u014d\\u0150-\\u016b\\u016e-\\u017e\\u0192\\u01fa-\\u01ff' +
    '\\u0218-\\u021b\\u0237\\u02c6-\\u02c7\\u02d8-\\u02dd\\u0300-\\u0304\\u0306-\\u0308\\u030a-\\u030c' +
    '\\u0312\\u0326-\\u0327\\u0335\\u0337-\\u0338\\u03a9\\u03c0\\u1e80-\\u1e85' +
    '\\u1ef2-\\u1ef3\\u2013-\\u2014\\u2018-\\u201a\\u201c-\\u201e\\u2020-\\u2022\\u2026\\u2030' +
    '\\u2032\\u2039-\\u203a\\u2042\\u2044\\u2070\\u2074-\\u2079\\u2080-\\u2089' +
    '\\u20ac\\u2116-\\u2117\\u2122\\u212e\\u215b-\\u215e\\u2190-\\u2199\\u2202' +
    '\\u2205-\\u2206\\u220f\\u2211-\\u2212\\u221a\\u221e\\u222b\\u2248' +
    '\\u2260\\u2264-\\u2265\\u25a0-\\u25a1\\u25b2-\\u25b3\\u25ca-\\u25cb\\u25cf\\u262e' +
    '\\u2713\\uf8ff\\ufb00-\\ufb04' +
    ']',
  'u'
);

// Conservative advance widths measured on the bundled Satoshi Bold font.
// Size long numeric strings to their row without dropping signs or digits.
function fittedValueSize(value: string, preferred: number, width: number) {
  let em = 0;
  for (const character of value) {
    if (character >= '0' && character <= '9') em += 0.71;
    else if (character === '.' || character === ',') em += 0.3;
    else em += 1.1;
  }
  return Math.min(preferred, Math.floor(width / Math.max(1, em)));
}

export function proofBriefImageLayout(
  brief: CertifiedProofBrief,
  format: ProofBriefImageFormat
) {
  if (!isProofBriefImageFormat(format)) {
    throw new ProofBriefError('Unsupported image format.', 'invalid-brief');
  }
  const brand = proofBriefBrand(brief);
  const limits = PROOF_BRIEF_TEXT_LIMITS;
  const size = PROOF_BRIEF_IMAGE_SIZES[format];
  const contentWidth = size.width - 128;
  const tall = format !== 'landscape';
  const labels: [string, number][] = [
    [brand.eyebrow.toUpperCase(), 36],
    [clampProofBriefText(brief.window.label, limits.window).toUpperCase(), 36],
    [clampProofBriefText(brief.hero.label ?? '', limits.heroLabel), 44],
    [
      brief.hero.value == null
        ? clampProofBriefText(brief.hero.sentence, limits.heroSentence)
        : '',
      44,
    ],
    ...brief.supportingPoints.map((point): [string, number] => [
      clampProofBriefText(point.label, limits.pointLabel),
      38,
    ]),
    [brand.product, 36],
  ];
  const painted = [
    ...labels.map(([text]) => text),
    brief.hero.value ?? '',
    ...brief.supportingPoints.map(point => point.value ?? ''),
    proofBriefProvenance(brief),
  ];
  if (painted.some(text => unsupportedSatoshiGlyph.test(text))) {
    throw new ProofBriefError(
      'This text cannot be drawn with the proof card font.',
      'invalid-brief'
    );
  }
  if (
    tall &&
    labels.some(([text, fontSize]) =>
      text
        .split(/\s+/u)
        .some(word => fittedValueSize(word, fontSize, contentWidth) < fontSize)
    )
  ) {
    throw new ProofBriefError(
      'A label does not fit the selected image format.',
      'invalid-brief'
    );
  }
  const pointWidth = tall
    ? contentWidth
    : contentWidth / Math.max(1, brief.supportingPoints.length) - 48;
  const heroSize = fittedValueSize(brief.hero.value ?? '', 156, contentWidth);
  const pointSizes = brief.supportingPoints.map(point =>
    fittedValueSize(point.value ?? '', tall ? 52 : 40, pointWidth)
  );
  // At a 340px feed width 36 source pixels are just over 11 CSS pixels.
  // Reject an image format that would obscure a certified number.
  if (tall && (heroSize < 36 || pointSizes.some(fontSize => fontSize < 36))) {
    throw new ProofBriefError(
      'Metric value does not fit the selected image format.',
      'invalid-brief'
    );
  }
  return { size, heroSize, pointSizes };
}

export function proofBriefImagePath(
  brief: CertifiedProofBrief,
  format: ProofBriefImageFormat = 'landscape'
): string {
  return `/api/share/proof-brief?brief=${encodeURIComponent(brief.briefId)}&rev=${brief.revision}${format === 'landscape' ? '' : `&format=${format}`}`;
}

// The caller has already certified the brief for its audience. Keep giving
// them the text card when the publisher cannot render its optional image.
export function availableProofBriefImagePath(
  brief: CertifiedProofBrief
): string | null {
  if (brief.privacy !== 'public') return null;
  try {
    proofBriefImageLayout(brief, 'landscape');
    return proofBriefImagePath(brief);
  } catch (error) {
    if (error instanceof ProofBriefError) return null;
    throw error;
  }
}
