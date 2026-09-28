import { COMPANY_IDENTITY } from '@/data/companyIdentity';
import { MARKETING_FEATURE_CAPABILITIES } from '@/data/marketing/featureAvailability';
import type {
  AnswerReusePack,
  DistributionApprovals,
} from '@/lib/investors/answer-reuse';

const SOURCE_VERSION = 'jov-6261-2026-09-17';
const CONTENT_REVISION = '2026-09-28';
const NO_DISTRIBUTION: DistributionApprovals = {
  publicPublishing: { state: 'not-approved' },
  emailSocialSending: { state: 'not-approved' },
  paidPromotion: { state: 'not-approved' },
};
const SHARED_CLAIM_USES = [
  {
    claimId: 'company-identity-definition',
    revisionId: SOURCE_VERSION,
    emphasis:
      'Use the shared company definition without broadening availability.',
  },
  {
    claimId: 'public-profile-availability',
    revisionId: 'jov-6216-public-profile-2026-09-17',
    emphasis: 'Keep the generally available starting point concrete.',
  },
] as const;

/**
 * JOV-6288's first bounded reuse pack. The source answer is existing approved
 * public identity copy. The three derivatives have real intended uses but stay
 * drafts with no publication, send, or promotion authority.
 */
export const INVESTOR_ANSWER_REUSE_PACK = {
  sourceAnswer: {
    answerId: 'company-identity-and-audience',
    version: SOURCE_VERSION,
    directAnswer: COMPANY_IDENTITY.definition,
    owner: 'Tim White',
    review: {
      state: 'approved',
      reviewedBy: 'Tim White',
      reviewedAt: '2026-09-17',
      approvalBasis:
        'JOV-6261 canonical public company identity and the founder-directed shared language contract.',
    },
    claims: [
      {
        claimId: 'company-identity-definition',
        revisionId: SOURCE_VERSION,
        kind: 'identity',
        statement: COMPANY_IDENTITY.definition,
        disclosure: 'public',
        evidenceQuality: 'canonical',
        evidenceRefs: ['apps/web/data/companyIdentity.ts#COMPANY_IDENTITY'],
        revisedAt: '2026-09-17',
      },
      {
        claimId: 'public-profile-availability',
        revisionId: 'jov-6216-public-profile-2026-09-17',
        kind: 'current-availability',
        statement:
          'A claimable public profile page is generally available with open access.',
        disclosure: 'public',
        evidenceQuality: 'verified',
        evidenceRefs: [
          'apps/web/data/marketing/featureAvailability.ts#public-profile',
        ],
        revisedAt:
          MARKETING_FEATURE_CAPABILITIES['public-profile'].contentRevision,
      },
    ],
  },
  derivatives: [
    {
      derivativeId: 'company-identity-investor-slide',
      sourceAnswerId: 'company-identity-and-audience',
      sourceAnswerVersion: SOURCE_VERSION,
      audience: 'investors evaluating Jovie market scope',
      purpose:
        'Explain the shared product boundary and current starting point.',
      channel: 'investor-deck',
      treatment: 'investor-context',
      intendedUse:
        'Candidate slide for the next reviewed investor deck revision.',
      nextStep:
        'Offer the current product walkthrough when implementation depth is the concern.',
      successMetric: 'qualified-response',
      claimUses: SHARED_CLAIM_USES,
      disclosure: 'private-investor',
      owner: 'Tim White',
      review: { state: 'draft' },
      distribution: NO_DISTRIBUTION,
      releaseState: 'candidate',
      contentRevision: CONTENT_REVISION,
      content: {
        title: 'One product. Five starting contexts.',
        summary:
          'Jovie serves artists, founders, authors, creators, and independent experts through one product for presence, relationships, and growth.',
        sections: [
          {
            heading: 'Current starting point',
            body: 'A claimable public profile is generally available today. Audience-specific workflows earn their place one supported job at a time.',
          },
        ],
      },
      usageReceipts: [],
      history: [],
    },
    {
      derivativeId: 'company-identity-customer-explanation',
      sourceAnswerId: 'company-identity-and-audience',
      sourceAnswerVersion: SOURCE_VERSION,
      audience: 'people deciding whether a Jovie profile fits their work',
      purpose: 'Explain the immediate customer value without investor framing.',
      channel: 'customer-editorial',
      treatment: 'customer-value',
      intendedUse:
        'Candidate customer-education article for the existing blog.',
      nextStep: 'Invite the reader to find and claim their public profile.',
      successMetric: 'customer-comprehension',
      claimUses: SHARED_CLAIM_USES,
      disclosure: 'public',
      owner: 'Tim White',
      review: { state: 'draft' },
      distribution: NO_DISTRIBUTION,
      releaseState: 'candidate',
      canonicalPath: '/blog/one-profile-for-your-work',
      contentRevision: CONTENT_REVISION,
      content: {
        title: 'Give your work one clear home',
        summary:
          'Claim a public Jovie profile so people can understand your work and find the next step you choose.',
        sections: [
          {
            heading: 'Start with your public profile',
            body: 'Your profile gives your name, work, and relevant links one public place. Claimable public profiles are available today.',
          },
          {
            heading: 'Keep the context that matters',
            body: 'Artists, founders, authors, creators, and independent experts share a need to be found. Their work keeps its own language and supported next steps.',
          },
        ],
      },
      usageReceipts: [],
      history: [],
    },
    {
      derivativeId: 'company-identity-recruiting-narrative',
      sourceAnswerId: 'company-identity-and-audience',
      sourceAnswerVersion: SOURCE_VERSION,
      audience: 'engineering and product candidates',
      purpose: 'Explain the product constraint new hires will help preserve.',
      channel: 'recruiting-narrative',
      treatment: 'hiring-context',
      intendedUse: 'Candidate narrative block for role briefs and interviews.',
      nextStep:
        'Invite a candidate to discuss one shared system and one audience-specific job.',
      successMetric: 'candidate-progression',
      claimUses: SHARED_CLAIM_USES,
      disclosure: 'internal',
      owner: 'Tim White',
      review: { state: 'draft' },
      distribution: NO_DISTRIBUTION,
      releaseState: 'candidate',
      contentRevision: CONTENT_REVISION,
      content: {
        title: 'Build one system without flattening the work',
        summary:
          'Jovie serves several kinds of independent work through one product for presence, relationships, and growth.',
        sections: [
          {
            heading: 'The product constraint',
            body: 'We share the profile and relationship foundations while keeping audience-specific language, evidence, and availability intact.',
          },
          {
            heading: 'The work ahead',
            body: 'New workflows begin with one supported job. A broad company identity never turns a roadmap into a current capability.',
          },
        ],
      },
      usageReceipts: [],
      history: [],
    },
  ],
} as const satisfies AnswerReusePack;
