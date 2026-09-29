import {
  assertProofBriefRenderable,
  type CertifiedProofBrief,
  type ProofBriefAttribution,
  type ProofBriefEvidence,
  type ProofBriefPrivacy,
  type ProofBriefWindow,
} from './contract';

export interface CustomerRecapUpdate {
  readonly statement: string;
  readonly attribution: ProofBriefAttribution;
  readonly evidenceIds: readonly string[];
}

interface CustomerWeeklyRecapInput {
  readonly briefId: string;
  readonly revision: number;
  readonly subject: string;
  readonly window: ProofBriefWindow;
  readonly updates: readonly CustomerRecapUpdate[];
  readonly evidence: readonly ProofBriefEvidence[];
  readonly unknowns: readonly string[];
  readonly privacy: ProofBriefPrivacy;
  readonly generatedAt: string;
  readonly expiresAt: string;
}

const SMALL_NUMBER_WORDS = ['zero', 'one', 'two', 'three'] as const;

/** Build one exact seven-calendar-day brief and certify every rendered claim. */
export function buildCustomerWeeklyRecap(
  input: CustomerWeeklyRecapInput
): CertifiedProofBrief {
  const start = new Date(`${input.window.start}T00:00:00.000Z`);
  const endExclusive = new Date(`${input.window.end}T00:00:00.000Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  if (endExclusive.getTime() - start.getTime() !== 7 * 86_400_000) {
    throw new TypeError('Customer recaps must cover exactly seven UTC days.');
  }
  if (
    input.updates.length > 3 ||
    input.evidence.some(receipt => {
      const occurredAt = Date.parse(receipt.occurredAt);
      return (
        occurredAt < start.getTime() || occurredAt >= endExclusive.getTime()
      );
    })
  ) {
    throw new TypeError('Customer recap evidence must fall inside its window.');
  }

  const count = input.updates.length;
  const status = count > 0 ? 'progress' : 'insufficient-evidence';
  const brief: CertifiedProofBrief = {
    schema: 'proof-brief/v1',
    briefId: input.briefId,
    revision: input.revision,
    status,
    subject: input.subject,
    window: input.window,
    hero: {
      sentence:
        count > 0
          ? `Jovie completed ${SMALL_NUMBER_WORDS[count]} verified updates to your public profile this week.`
          : 'Jovie does not have enough verified evidence to recap this week yet.',
      ...(count > 0 ? { value: String(count), label: 'verified updates' } : {}),
      attribution: count > 0 ? 'execution' : 'observed',
      evidenceIds: [
        ...new Set(input.updates.flatMap(item => item.evidenceIds)),
      ],
    },
    supportingPoints: input.updates.map(update => ({
      label: update.statement,
      attribution: update.attribution,
      evidenceIds: update.evidenceIds,
    })),
    evidence: input.evidence,
    unknowns: input.unknowns,
    privacy: input.privacy,
    generatedAt: input.generatedAt,
    expiresAt: input.expiresAt,
  };
  assertProofBriefRenderable(brief, { now: new Date(input.generatedAt) });
  return brief;
}

const TIM_WINDOW = {
  start: '2026-09-23',
  end: '2026-09-29',
  label: 'Sep 23 to Sep 29, 2026',
} as const;

const TIM_UNKNOWNS = [
  'profile visits',
  'audience and contact growth',
  'fan actions and conversions',
  'ticket, merch, and revenue outcomes',
] as const;

/**
 * First dogfood recap. Sources are immutable merge commits plus the live Tim
 * profile observed at the recorded timestamp. No production analytics were
 * available, so audience and business metrics remain explicitly unknown.
 */
export const CERTIFIED_PROOF_BRIEF = buildCustomerWeeklyRecap({
  briefId: 'pb_2026-09-29_tim_customer',
  revision: 1,
  subject: 'Tim White',
  window: TIM_WINDOW,
  updates: [
    {
      statement: 'Jovie added Ask Jovie to your public profile.',
      attribution: 'execution',
      evidenceIds: ['commit:4649c44ac0', 'live:tim:ask-jovie'],
    },
    {
      statement:
        'Jovie added a fuller artist summary and source-linked FAQs to your profile.',
      attribution: 'execution',
      evidenceIds: ['commit:5ac9f7320b', 'live:tim:profile-summary'],
    },
  ],
  evidence: [
    {
      id: 'commit:4649c44ac0',
      kind: 'execution',
      occurredAt: '2026-09-28T20:12:21.000Z',
      sourceUrl:
        'https://github.com/JovieInc/Jovie/commit/4649c44ac0b23631b888da78de3799ff977eed0b',
      summary: 'Merged the Ask Jovie surface for public profiles.',
    },
    {
      id: 'live:tim:ask-jovie',
      kind: 'observation',
      occurredAt: '2026-09-29T21:57:21.000Z',
      sourceUrl: 'https://jov.ie/tim',
      summary: 'HTTP 200 page rendered Ask Jovie about Tim White.',
    },
    {
      id: 'commit:5ac9f7320b',
      kind: 'execution',
      occurredAt: '2026-09-27T21:02:58.000Z',
      sourceUrl:
        'https://github.com/JovieInc/Jovie/commit/5ac9f7320b783aa540df4f008144fb43f884e960',
      summary: 'Merged the richer public-profile summary and sparse FAQs.',
    },
    {
      id: 'live:tim:profile-summary',
      kind: 'observation',
      occurredAt: '2026-09-29T21:57:21.000Z',
      sourceUrl: 'https://jov.ie/tim',
      summary:
        'HTTP 200 page rendered Tim-specific artist copy and sourced FAQs.',
    },
  ],
  unknowns: TIM_UNKNOWNS,
  privacy: 'public',
  generatedAt: '2026-09-29T21:57:21.000Z',
  expiresAt: '2026-10-13T00:00:00.000Z',
});

export const INSUFFICIENT_EVIDENCE_PROOF_BRIEF = buildCustomerWeeklyRecap({
  briefId: 'pb_2026-09-29_tim_customer_no_evidence',
  revision: 1,
  subject: 'Tim White',
  window: TIM_WINDOW,
  updates: [],
  evidence: [],
  unknowns: TIM_UNKNOWNS,
  privacy: 'public',
  generatedAt: '2026-09-29T21:57:21.000Z',
  expiresAt: '2026-10-13T00:00:00.000Z',
});
