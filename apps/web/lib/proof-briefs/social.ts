import {
  assertProofBriefRenderable,
  type CertifiedProofBrief,
} from './contract';
import { PROOF_BRIEF_CARD_SIZE } from './image';

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
  options: { readonly now?: Date } = {}
): ProofBriefSocialDraft {
  assertProofBriefRenderable(brief, { now: options.now, requirePublic: true });

  const strongest = brief.supportingPoints.find(p => p.value != null);
  const leadLine =
    brief.hero.value != null
      ? `${brief.hero.value} ${brief.hero.label ?? 'results'} for ${brief.subject} this week.`
      : strongest
        ? `${strongest.value} ${strongest.label} for ${brief.subject} this week.`
        : brief.hero.sentence;

  const copy = [leadLine, `${brief.window.label} — proof from Jovie.`].join(
    '\n'
  );

  return {
    copy,
    altText: `Proof card for ${brief.subject}, ${brief.window.label}: ${brief.hero.sentence}`,
    image: {
      url: `/api/share/proof-brief?brief=${encodeURIComponent(brief.briefId)}&rev=${brief.revision}`,
      width: PROOF_BRIEF_CARD_SIZE.width,
      height: PROOF_BRIEF_CARD_SIZE.height,
    },
  };
}
