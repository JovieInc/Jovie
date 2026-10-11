/**
 * Proof brief → summer.ops-card.v1 for the founder chat (JOV-7213). The
 * certified brief stays the source of truth; the card is one renderer that
 * carries the hero claim, supporting proof points, and the shareable image
 * path so the same facts reach chat, Messages, and email unchanged.
 */

import {
  SUMMER_OPS_CARD_SCHEMA,
  type SummerOpsCard,
  type SummerOpsCardFact,
} from '@/lib/ovie/ops-card';
import {
  assertProofBriefRenderable,
  type CertifiedProofBrief,
  proofBriefBrand,
  proofBriefProvenance,
} from './contract';

export function proofBriefImagePath(brief: CertifiedProofBrief): string {
  return `/api/share/proof-brief?brief=${encodeURIComponent(brief.briefId)}&rev=${brief.revision}`;
}

export function buildProofBriefOpsCard(
  brief: CertifiedProofBrief,
  options: { readonly now?: Date } = {}
): SummerOpsCard {
  assertProofBriefRenderable(brief, { now: options.now });

  const facts: SummerOpsCardFact[] = [];
  if (brief.hero.value != null) {
    facts.push({
      label: brief.hero.label ?? 'Result',
      value: brief.hero.value,
    });
  }
  for (const point of brief.supportingPoints) {
    facts.push({
      label: point.label,
      value: point.value ?? 'Verified',
    });
  }
  if (brief.privacy === 'public') {
    facts.push({ label: 'Share image', value: proofBriefImagePath(brief) });
  }

  return {
    schema: SUMMER_OPS_CARD_SCHEMA,
    kind: 'generic',
    title: `${proofBriefBrand(brief).product} proof — ${brief.window.label}`,
    summary: brief.hero.sentence,
    state: 'fresh',
    observedAt: brief.generatedAt,
    source: proofBriefProvenance(brief),
    facts,
    series: null,
  };
}
