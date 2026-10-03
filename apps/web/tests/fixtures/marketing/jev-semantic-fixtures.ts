import type {
  MarketingSemanticReviewInput,
  MarketingSemanticVerdict,
} from '@/data/marketing/semanticReview';

const SOURCE_SHA = 'a'.repeat(40);
const ARTIFACT_SHA256 = 'b'.repeat(64);

export type SyntheticJevFixtureSplit = 'development' | 'held-out';

export interface SyntheticJevSemanticFixture {
  readonly id: string;
  readonly split: SyntheticJevFixtureSplit;
  readonly synthetic: true;
  readonly labelSource: 'synthetic-hand-authored';
  readonly expectedVerdict: MarketingSemanticVerdict;
  readonly input: MarketingSemanticReviewInput;
}

const base = {
  route: '/pricing',
  pageId: 'pricing',
  audience: 'artists comparing plan value',
  objective: 'choose a plan or start onboarding',
  sourceSha: SOURCE_SHA,
  artifactSha256: ARTIFACT_SHA256,
} as const;

const pricingClaim = {
  id: 'release-workspace',
  statement: 'Keep your release work in one place.',
  renderedText: 'Keep your release work in one place.',
} as const;

const pricingEvidence = [
  {
    id: 'release-workspace-proof',
    statement:
      'The product workspace groups release planning tasks in one view.',
  },
] as const;

const sectionA = {
  id: 'hero',
  question: 'What should I do with my next release?',
  responsibility: 'Name the release workspace outcome.',
  customerBelief:
    'I can organize the work without adding another scattered tool.',
  evidenceRefs: ['release-workspace-proof'],
} as const;

const sectionB = {
  id: 'proof',
  question: 'What does the workspace help me organize?',
  responsibility: 'Show the release workflow in action.',
  customerBelief: 'I can see the work move from plan to release.',
  evidenceRefs: ['release-workspace-proof'],
} as const;

export const SYNTHETIC_JEV_SEMANTIC_FIXTURES: readonly SyntheticJevSemanticFixture[] =
  [
    {
      id: 'dev-pricing-claim-supported',
      split: 'development',
      synthetic: true,
      labelSource: 'synthetic-hand-authored',
      expectedVerdict: 'supported',
      input: {
        ...base,
        check: 'claim-support',
        claim: pricingClaim,
        supportingEvidence: pricingEvidence,
      },
    },
    {
      id: 'dev-pricing-claim-contradicted',
      split: 'development',
      synthetic: true,
      labelSource: 'synthetic-hand-authored',
      expectedVerdict: 'contradicted',
      input: {
        ...base,
        check: 'claim-support',
        claim: {
          id: 'guaranteed-growth',
          statement: 'Jovie guarantees faster growth for every artist.',
          renderedText: 'Jovie guarantees faster growth for every artist.',
        },
        supportingEvidence: [
          {
            id: 'no-growth-guarantee',
            statement:
              'The product provides release planning tools; no growth guarantee is established.',
          },
        ],
      },
    },
    {
      id: 'dev-pricing-section-paraphrase-overlap',
      split: 'development',
      synthetic: true,
      labelSource: 'synthetic-hand-authored',
      expectedVerdict: 'contradicted',
      input: {
        ...base,
        check: 'section-overlap',
        sections: [
          sectionA,
          {
            ...sectionB,
            question: 'How do I keep the next release organized?',
            responsibility:
              'Explain how the release workspace keeps the work together.',
            customerBelief: 'My release work can stay organized in one place.',
          },
        ],
      },
    },
    {
      id: 'dev-pricing-section-exact-overlap',
      split: 'development',
      synthetic: true,
      labelSource: 'synthetic-hand-authored',
      expectedVerdict: 'contradicted',
      input: {
        ...base,
        check: 'section-overlap',
        sections: [sectionA, { ...sectionB, question: sectionA.question }],
      },
    },
    {
      id: 'dev-pricing-cta-expectation-supported',
      split: 'development',
      synthetic: true,
      labelSource: 'synthetic-hand-authored',
      expectedVerdict: 'supported',
      input: {
        ...base,
        check: 'cta-expectation',
        cta: {
          id: 'start-onboarding',
          label: 'Start planning',
          renderedLabel: 'Start planning',
          href: '/start',
          expectedAction: 'start onboarding',
          destinationAction: 'start onboarding',
          eligibility: 'artist',
          destinationEligibility: 'artist',
          destinationDescription:
            'The onboarding flow starts a release planning workspace.',
        },
      },
    },
    {
      id: 'held-out-onboarding-error-claim-insufficient',
      split: 'held-out',
      synthetic: true,
      labelSource: 'synthetic-hand-authored',
      expectedVerdict: 'insufficient',
      input: {
        ...base,
        route: '/start?error=profile-unavailable',
        pageId: 'onboarding-error',
        audience: 'an artist returning to onboarding after an error',
        objective: 'recover without promising an unavailable profile',
        check: 'claim-support',
        claim: {
          id: 'profile-ready',
          statement: 'Your public profile is ready to publish.',
          renderedText: 'Your public profile is ready to publish.',
        },
        supportingEvidence: [
          {
            id: 'profile-unavailable-error',
            statement:
              'The onboarding state says the profile is temporarily unavailable and offers retry.',
          },
        ],
      },
    },
    {
      id: 'held-out-onboarding-error-cta-contradicted',
      split: 'held-out',
      synthetic: true,
      labelSource: 'synthetic-hand-authored',
      expectedVerdict: 'contradicted',
      input: {
        ...base,
        route: '/start?error=profile-unavailable',
        pageId: 'onboarding-error',
        audience: 'an artist returning to onboarding after an error',
        objective: 'recover without promising an unavailable profile',
        check: 'cta-expectation',
        cta: {
          id: 'claim-profile',
          label: 'Claim your profile',
          renderedLabel: 'Claim your profile',
          href: '/start/retry',
          expectedAction: 'retry onboarding',
          destinationAction: 'retry onboarding',
          eligibility: 'artist',
          destinationEligibility: 'artist',
          destinationDescription:
            'The destination retries profile availability; it does not claim a profile.',
        },
      },
    },
  ];
