import {
  assertProofBriefRenderable,
  type CertifiedProofBrief,
  proofBriefBrand,
} from './contract';
import {
  clampProofBriefText,
  PROOF_BRIEF_TEXT_LIMITS,
  type ProofBriefImageFormat,
  proofBriefImageLayout,
  proofBriefImagePath,
} from './image-layout';

export interface ProofBriefSocialDraft {
  /** Draft copy only — posting is a separate, human-authorized step. */
  readonly copy: string;
  readonly altText: string;
  /** Image card compatible with the draft (same brief/revision). */
  readonly image: {
    readonly url: string;
    readonly width: number;
    readonly height: number;
  };
}

/**
 * Social draft. Leads with the single strongest public-safe proof point
 * rather than dumping the whole weekly card. Private briefs never produce
 * a draft.
 */
export function renderProofBriefSocialDraft(
  brief: CertifiedProofBrief,
  options: { readonly now?: Date; readonly format?: ProofBriefImageFormat } = {}
): ProofBriefSocialDraft {
  assertProofBriefRenderable(brief, { now: options.now, requirePublic: true });

  const format = options.format ?? 'landscape';
  const { size } = proofBriefImageLayout(brief, format);
  const strongest = brief.supportingPoints.find(p => p.value != null);
  const leadLine =
    brief.hero.value != null
      ? `${brief.hero.value} ${brief.hero.label ?? 'results'} for ${brief.subject}.`
      : strongest
        ? `${strongest.value} ${strongest.label} for ${brief.subject}.`
        : brief.hero.sentence;

  const copy = [
    leadLine,
    `${brief.window.label} | proof from ${proofBriefBrand(brief).product}.`,
  ].join('\n');

  const limits = PROOF_BRIEF_TEXT_LIMITS;
  const { hero } = brief;
  const heroText = [
    hero.value,
    hero.label && clampProofBriefText(hero.label, limits.heroLabel),
    hero.value == null &&
      clampProofBriefText(hero.sentence, limits.heroSentence),
  ]
    .filter(Boolean)
    .join(' ');
  const altText = [
    `Proof card for ${brief.subject}, ${clampProofBriefText(brief.window.label, limits.window)}`,
    heroText,
    ...brief.supportingPoints.map(point =>
      [point.value, clampProofBriefText(point.label, limits.pointLabel)]
        .filter(Boolean)
        .join(' ')
    ),
    brief.unknowns.length > 0 && 'Unmeasured outcomes remain unknown.',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    copy,
    altText,
    image: {
      url: proofBriefImagePath(brief, format),
      ...size,
    },
  };
}
