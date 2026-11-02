import { ARTIST_VISIBILITY_OFFER } from '@/lib/config/plan-prices';
import { formatAmountNoCents } from '@/lib/utils/format-number';

export type EvidenceStatus = 'verified' | 'internal' | 'unverified';
export type ClaimClassification =
  | 'verified-fact'
  | 'founder-attested'
  | 'thesis'
  | 'plan';
export type SourceClassification =
  | 'first-party-artifact'
  | 'founder-authored'
  | 'external-context';
export type OperatingStatus = 'BUILT, NOT CERTIFIED' | 'DEMO' | 'PLANNED';
export type RiskSeverity = 'critical' | 'high' | 'medium';
export type ObjectionFrequency =
  | 'frequent'
  | 'common'
  | 'occasional'
  | 'unknown';
export type GapClassification =
  | 'communication'
  | 'evidence'
  | 'strategy'
  | 'investor-fit';

export interface ClaimProvenance {
  readonly label: string;
  readonly href: string;
  readonly accessedAt: string;
  readonly classification: SourceClassification;
}

export interface FundraisingClaim {
  readonly id: string;
  readonly statement: string;
  readonly status: EvidenceStatus;
  readonly provenance: readonly ClaimProvenance[];
  readonly investorFacing: boolean;
  readonly classification: ClaimClassification;
}

export interface CoreSlide {
  readonly label: string;
  readonly status: string;
  readonly id: string;
  readonly dominantSentence: string;
  readonly support: readonly string[];
  readonly claimIds: readonly string[];
}

export interface RiskEntry {
  readonly id: string;
  readonly question: string;
  readonly answer: string;
  readonly severity: RiskSeverity;
  readonly evidenceGap: string | null;
  readonly frequency: ObjectionFrequency;
  readonly gapClassification: GapClassification;
  readonly supportingClaimIds: readonly string[];
  readonly affectedSlideIds: readonly string[];
  readonly portalSections: readonly string[];
  readonly recommendedCompanyAction: string;
  readonly recommendedCommunicationAction: string;
  readonly lastUpdated: string;
}

export interface OperatingStep {
  readonly id: string;
  readonly status: OperatingStatus;
  readonly title: string;
  readonly description: string;
}

export interface FundraisingRegistry {
  readonly version: string;
  readonly asOf: string;
  readonly thesis: string;
  readonly companyDefinition: string;
  readonly claims: readonly FundraisingClaim[];
  readonly coreSlides: readonly CoreSlide[];
  readonly operatingLoop: readonly OperatingStep[];
  readonly founderLetter: readonly string[];
  readonly risks: readonly RiskEntry[];
  readonly appendix: readonly {
    id: string;
    title: string;
    body: string;
    href?: string;
  }[];
  readonly demo: {
    title: string;
    description: string;
    videoPath: string;
    captionsPath: string;
    posterPath: string;
    script: readonly string[];
    status: OperatingStatus;
  };
  readonly evidenceGaps: readonly string[];
  readonly changeHistory: readonly {
    date: string;
    summary: string;
  }[];
}

const AS_OF = '2026-11-02';
const OFFER = ARTIST_VISIBILITY_OFFER.pro;
const PRICE = formatAmountNoCents(OFFER.monthlyUsd * 100);
const OFFER_SENTENCE = `${OFFER.displayName} is ${PRICE}/month.`;

function source(
  label: string,
  href: string,
  classification: SourceClassification
): ClaimProvenance {
  return { label, href, accessedAt: AS_OF, classification };
}

function claim(
  id: string,
  statement: string,
  status: EvidenceStatus,
  provenance: readonly ClaimProvenance[],
  investorFacing: boolean,
  classification: ClaimClassification
): FundraisingClaim {
  return { id, statement, status, provenance, investorFacing, classification };
}

function slide(
  id: string,
  dominantSentence: string,
  support: readonly string[],
  claimId: string,
  label: string,
  status: string
): CoreSlide {
  return { id, dominantSentence, support, claimIds: [claimId], label, status };
}

function operatingStep(
  id: string,
  status: OperatingStatus,
  title: string,
  description: string
): OperatingStep {
  return { id, status, title, description };
}

function risk(
  id: string,
  question: string,
  answer: string,
  severity: RiskSeverity,
  evidenceGap: string,
  gapClassification: GapClassification,
  supportingClaimIds: readonly string[],
  affectedSlideIds: readonly string[],
  portalSections: readonly string[],
  recommendedCompanyAction: string,
  recommendedCommunicationAction: string
): RiskEntry {
  return {
    id,
    question,
    answer,
    severity,
    evidenceGap,
    frequency: 'unknown',
    gapClassification,
    supportingClaimIds,
    affectedSlideIds,
    portalSections,
    recommendedCompanyAction,
    recommendedCommunicationAction,
    lastUpdated: AS_OF,
  };
}

function appendixItem(
  id: string,
  title: string,
  body: string
): FundraisingRegistry['appendix'][number] {
  return { id, title, body };
}

type ClaimInput = Parameters<typeof claim>;
type SlideInput = Parameters<typeof slide>;
type OperatingStepInput = Parameters<typeof operatingStep>;
type RiskInput = Parameters<typeof risk>;
type AppendixInput = Parameters<typeof appendixItem>;

// biome-ignore format: One content record per line prevents structural duplication while keeping review diffs readable.
const CLAIM_DATA = [
  ["slide-product", "Catalog import, profiles, release pages, chat, and merch to checkout are built.", "verified", [source("Built inventory, 2026-11-02", "urn:jovie:source:2026-11-02:built-inventory", "first-party-artifact")], true, "verified-fact"],
  ["slide-problem", "The spike should leave a list.", "internal", [], true, "thesis"],
  ["founder-artist-operator", "I am Jovie’s solo founder and its first customer.", "internal", [source("Tim White, team-final.txt and context.md, supplied 2026-11-02", "urn:jovie:source:2026-11-02:team-final", "founder-authored")], true, "founder-attested"],
  ["slide-loop", "I work with one auto-scaling agent, Summer.", "verified", [source("memo-sources.md and team-final.txt, 2026-11-02", "urn:jovie:source:2026-11-02:memo-sources", "first-party-artifact")], true, "verified-fact"],
  ["slide-wedge", "$0 revenue. Zero paying customers.", "internal", [source("Tim White, traction-1000.txt, supplied 2026-11-02", "urn:jovie:source:2026-11-02:traction-1000", "founder-authored")], true, "founder-attested"],
  ["slide-thesis", OFFER_SENTENCE, "verified", [source("Canonical Artist Presence offer", "/pricing", "first-party-artifact")], true, "verified-fact"],
  ["slide-round", "I am asking speedrun for $500K.", "internal", [], true, "plan"],
  ['product-demo-exists', 'The historical walkthrough is not certification evidence.', 'internal', [], false, 'plan'],
  ['release-workflow-focus', 'Release pages are built, not certified.', 'verified', [source('Built inventory, 2026-11-02', 'urn:jovie:source:2026-11-02:built-inventory', 'first-party-artifact')], true, 'verified-fact'],
  ['closed-loop-category-context', 'Repeated customer value remains unproven.', 'internal', [], false, 'thesis'],
] as const satisfies readonly ClaimInput[];

// biome-ignore format: One content record per line prevents structural duplication while keeping review diffs readable.
const SLIDE_DATA = [
  ["product", "Catalog import, profiles, release pages, chat, and merch to checkout are built.", ["Nothing is certified. These are implemented paths, not proof of a completed customer journey.", "Release email is built but blocked. The catalog-reactivation agent is not built."], "slide-product", "What exists", "Built, not certified"],
  ["problem", "The spike should leave a list.", ["Musicians and politicians both campaign in spikes, then go silent. I saw it running artist release strategy and voter-file targeting and email.", "The smallest question: can an old song bring a listener back for another song?"], "slide-problem", "The problem", "Founder observation"],
  ["founder", "I am Jovie’s solo founder and its first customer.", ["I have been an artist for 15 years and ran release strategy for artists at Big Management.", "In 2016, I ran voter-file targeting and email for a large statewide PAC supporting a presidential primary campaign in New Jersey.", "I have sold software to strangers: up to eight people paid $39 a month for my Apify actor for about 15 months, with no marketing. Jovie has no paying customers yet."], "founder-artist-operator", "Why me", "Founder account"],
  ["loop", "I work with one auto-scaling agent, Summer.", ["I give it Linear issues. It scales its coding workers to the queue, opens PRs and repairs failing CI. CI and a merge queue gate correctness; I review taste from production.", "6,818 PRs merged in 90 days. Repository count through November 2, 2026. This measures engineering output, not customer value.", "Year one went into the loop, not the product. Cost: a year of customer feedback."], "slide-loop", "How Jovie ships", "Repository evidence · 2026-11-02"],
  ["wedge", "$0 revenue. Zero paying customers.", ["The smallest test is on my own catalog: a Jovie release page versus a plain link page on the same traffic, with two songs held out as a control. Pinned YouTube comments send listeners to each song’s page.", "Pass bar: 50 fans captured from old songs, emailed a real song they have not heard, with at least 30% clicking through.", "Pending. Release email is blocked. This tests re-engagement, not willingness to pay or an autonomous agent. No reactivation results are claimed."], "slide-wedge", "Traction and next proof", "Pre-revenue · test not run"],
  ["thesis", OFFER_SENTENCE, ["The offer is live; willingness to pay is unproven. A fan signup is not an artist payment, and a checkout path is not a sale.", "If artists repeatedly bring listeners back, the vision is to turn a back catalog into an audience for the next release."], "slide-thesis", "Business model", "Live offer · revenue unproven"],
  ["round", "I am asking speedrun for $500K.", ["Use-of-funds hypothesis: engineering throughput. Fund coding capacity, CI and runtime verification to turn implemented paths into certified customer journeys.", "More merged PRs alone would not validate that spend. Measure time from an observed customer problem to a verified fix, then paid activation and repeat use.", "The next proof is the catalog test and a paying artist. The ask is not a commitment, and no conversion is assumed."], "slide-round", "The ask", "Hypothesis · not committed"],
] as const satisfies readonly SlideInput[];

// biome-ignore format: One content record per line prevents structural duplication while keeping review diffs readable.
const OPERATING_STEP_DATA = [
  ["catalog-context", 'BUILT, NOT CERTIFIED', "Catalog import", "Spotify catalog import is implemented."],
  ["profile", 'BUILT, NOT CERTIFIED', "Artist profiles", "Profiles and smart links are implemented."],
  ["release", 'BUILT, NOT CERTIFIED', "Release pages", "Pages for individual releases are implemented."],
  ["chat", 'BUILT, NOT CERTIFIED', "Chat assistant", "The assistant and its tool routes are implemented."],
  ["merch", 'BUILT, NOT CERTIFIED', "Merch to checkout", "Chat tools, Printful products, Stripe Checkout and order handling are implemented. No real sale is evidenced."],
] as const satisfies readonly OperatingStepInput[];

// biome-ignore format: One content record per line prevents structural duplication while keeping review diffs readable.
const RISK_DATA = [
  ['product-readiness', 'How much of the agent is live today?', 'Catalog import, profiles, release pages, chat and merch to checkout are built, not certified. Release email is built but blocked. The catalog-reactivation agent is not built.', 'critical', 'A production capability matrix verified against deployed behavior.', 'evidence', ['product-demo-exists', 'release-workflow-focus'], ['product', 'loop'], ['demo', 'operating-loop'], 'Verify each demonstrated capability against deployed behavior and record its operating status.', 'Keep the capability labels adjacent to the demo and operating loop.'],
  ['traction', 'What customer traction is proven?', 'Jovie has $0 revenue and zero paying customers as of November 2, 2026. The catalog test has not run; the reactivation bar has not been met.', 'critical', 'Dated customer, revenue, activation, and retention evidence.', 'evidence', [], ['product', 'round'], ['brief', 'questions'], 'Define and collect dated activation, paid usage, and repeat-release cohorts.', 'Continue stating that the demo is not traction until reviewed cohorts exist.'],
  ['gtm', 'How will Jovie acquire creators?', 'Founder-led artist outreach and pre-built creator context are hypotheses to test; a repeatable paid acquisition or sales motion is not yet claimed.', 'critical', 'A defined outreach-to-paid funnel with cohort counts.', 'strategy', [], ['round'], ['questions'], 'Run a bounded founder-led outreach cohort and measure each funnel transition.', 'Describe acquisition as a hypothesis and show only observed funnel counts.'],
  ['market', 'Is the market venture-scale?', 'No market-size claim is made. A third-party product’s users or paid subscribers do not establish Jovie’s reachable paying market.', 'high', 'Bottom-up buyer counts, willingness to pay, and expansion sensitivity.', 'evidence', [], ['thesis', 'round'], ['brief', 'questions'], 'Build a bottom-up model from a defined buyer, observed willingness to pay, and reachable distribution.', 'Omit top-down arithmetic until its inputs and sensitivities are reviewable.'],
  ['business-model', 'Who pays, and for what?', `${OFFER_SENTENCE} The offer is live; willingness to pay and retention are unproven.`, 'critical', 'Paid pilots and willingness-to-pay interviews tied to a specific package.', 'strategy', ['release-workflow-focus'], ['wedge', 'round'], ['brief', 'questions'], 'Test one creator-paid release-operations package through paid pilots.', 'Label pricing and packaging as a working hypothesis until payment evidence exists.'],
  ['moat', 'Why will this not become a feature?', 'The proposed advantage is accumulated release context, approval history, execution reliability, and outcome data. That compounding advantage is not yet proven.', 'high', 'Evidence that repeated use improves execution or creates switching costs.', 'strategy', ['closed-loop-category-context'], ['loop'], ['operating-loop', 'questions'], 'Measure whether retained release context improves repeated execution or creates switching costs.', 'Present the compounding loop as the proposed advantage, not a proven moat.'],
  ['platform-dependency', 'How exposed is Jovie to music and social platforms?', 'Jovie depends on third-party catalog, audience, commerce, and messaging surfaces. The product must preserve first-party creator context and degrade safely when integrations change.', 'high', 'A dependency matrix with permissions, fallbacks, and owned data boundaries.', 'evidence', [], ['product', 'loop'], ['operating-loop', 'questions'], 'Document platform permissions, failure modes, fallbacks, and first-party data ownership.', 'State the dependency boundary and fallback posture without implying platform guarantees.'],
  ['ai-commoditization', 'What remains valuable as generation gets cheaper?', 'Copy generation is not the moat. The bet is on trustworthy context, approvals, execution, and measured outcomes.', 'high', 'Production proof of execution quality and outcome capture.', 'strategy', ['closed-loop-category-context'], ['wedge', 'loop'], ['operating-loop', 'questions'], 'Prove value in context, approvals, reliable execution, and measured outcomes rather than generation.', 'Keep implemented tools separate from unproven customer outcomes.'],
  ['founder-dependency', 'Can the workflow scale beyond the founder?', 'Founder expertise is currently an advantage and a concentration risk. Manual decisions must become explicit product rules and repeatable operations.', 'high', 'Non-founder operation of the workflow with consistent quality.', 'evidence', ['founder-artist-operator'], ['founder'], ['founder-letter', 'questions'], 'Have a non-founder operate the documented workflow and compare quality and completion.', 'Present founder expertise as both an advantage and a concentration risk.'],
  ['capital', 'What does new capital prove?', 'The ask is $500K from speedrun. Engineering throughput is the use-of-funds hypothesis. The ask is not committed capital; paid activation and repeat use remain unproven.', 'critical', 'Approved raise terms, milestone budget, and runway model.', 'evidence', [], ['round'], ['brief', 'questions'], 'Approve a milestone budget and runway model tied to paid activation and repeated release use.', 'Separate the requested amount from committed capital and the use-of-funds hypothesis from a measured return.'],
] as const satisfies readonly RiskInput[];

// biome-ignore format: One content record per line prevents structural duplication while keeping review diffs readable.
const APPENDIX_DATA = [
  ['narrative-boundary', 'Narrative Boundary', 'The core brief distinguishes verified facts, founder-attested context, thesis, and plans.'],
  ['risk-register', 'Risk Register', 'The questions above map to explicit evidence, strategy, communication, and investor-fit gaps.'],
  ['evidence', 'Evidence Boundary', 'The dated repository count is engineering output. Revenue and founder history are founder-attested. Product inventory proves implementation, not certification. The ask and test bar are plans.'],
] as const satisfies readonly AppendixInput[];

export const fundraisingRegistry = {
  version: '2.0.0',
  asOf: AS_OF,
  thesis: 'Built. Now prove it with an artist.',
  companyDefinition:
    'Catalog import, artist profiles, release pages, chat, and merch to checkout. Built, not certified.',
  claims: CLAIM_DATA.map(input =>
    claim(input[0], input[1], input[2], input[3], input[4], input[5])
  ),
  coreSlides: SLIDE_DATA.map(input =>
    slide(input[0], input[1], input[2], input[3], input[4], input[5])
  ),
  operatingLoop: OPERATING_STEP_DATA.map(input =>
    operatingStep(input[0], input[1], input[2], input[3])
  ),
  founderLetter: [
    'I am Jovie’s solo founder and its first customer: an artist for 15 years, and I ran release strategy for artists at Big Management. I also ran voter-file targeting and email for a large statewide PAC supporting a presidential primary campaign in New Jersey in 2016. Musicians and politicians both campaign in spikes, then go silent. The spike should leave a list.',
    'I work with one agent inside Jovie, Summer. I give it Linear issues; it scales its coding workers to the queue, opens PRs and repairs failing CI. CI and a merge queue gate correctness; I review taste from production. When an artist said his preview was “just my name and a photo,” the catalog import fix shipped the next day.',
    'I have sold software to strangers before: an Apify actor that up to eight people paid $39 a month for, for about 15 months, with no marketing. Jovie has no paying customers yet. That is the next proof.',
  ],
  risks: RISK_DATA.map(input =>
    risk(
      input[0],
      input[1],
      input[2],
      input[3],
      input[4],
      input[5],
      input[6],
      input[7],
      input[8],
      input[9],
      input[10]
    )
  ),
  appendix: APPENDIX_DATA.map(input =>
    appendixItem(input[0], input[1], input[2])
  ),
  demo: {
    title: 'Product Walkthrough',
    description:
      'A recorded product walkthrough. Demonstrated states are product direction, not customer traction.',
    videoPath: '/demo/jovie-demo.mp4',
    captionsPath: '/demo/jovie-demo.vtt',
    posterPath: '/demo/jovie-demo-poster.jpg',
    script: [
      'Start with a creator and release context.',
      'Show the opportunity surfaced from that context.',
      'Review the work before it ships.',
      'Separate the demonstrated workflow from production automation.',
    ],
    status: 'DEMO',
  },
  evidenceGaps: [
    'Production capability matrix.',
    'Paid activation and retention cohorts.',
    'Bottom-up market and willingness-to-pay evidence.',
    'Measured return on the engineering-throughput hypothesis.',
    'Measured outcomes from a complete release loop.',
  ],
  changeHistory: [
    {
      date: AS_OF,
      summary:
        'Refreshed the deck from the November 2 source inventory and founder account. Labels implementation, missing certification, zero revenue, a blocked test, and the speedrun ask explicitly.',
    },
  ],
} as const satisfies FundraisingRegistry;

export function getInvestorFacingClaims(): readonly FundraisingClaim[] {
  return fundraisingRegistry.claims.filter(claim => claim.investorFacing);
}

export interface RegistryValidationIssue {
  readonly path: string;
  readonly message: string;
}

export function validateFundraisingRegistry(
  registry: FundraisingRegistry
): readonly RegistryValidationIssue[] {
  const issues: RegistryValidationIssue[] = [];
  const claimIds = new Set(registry.claims.map(claim => claim.id));
  const slideIds = new Set(registry.coreSlides.map(slide => slide.id));
  const gapClassifications = new Set<GapClassification>([
    'communication',
    'evidence',
    'strategy',
    'investor-fit',
  ]);

  if (registry.coreSlides.length < 6 || registry.coreSlides.length > 8) {
    issues.push({
      path: 'coreSlides',
      message: 'The core narrative must contain 6–8 slides.',
    });
  }

  for (const [index, slide] of registry.coreSlides.entries()) {
    if (!slide.dominantSentence.trim().endsWith('.')) {
      issues.push({
        path: `coreSlides.${index}.dominantSentence`,
        message: 'Each dominant sentence must be a complete sentence.',
      });
    }
    if (slide.claimIds.length === 0) {
      issues.push({
        path: `coreSlides.${index}.claimIds`,
        message: 'Each core slide requires a canonical claim.',
      });
    }
    for (const claimId of slide.claimIds) {
      const claim = registry.claims.find(candidate => candidate.id === claimId);
      if (!claim) {
        issues.push({
          path: `coreSlides.${index}.claimIds`,
          message: `Unknown claim: ${claimId}`,
        });
      } else if (!claim.investorFacing || claim.status === 'unverified') {
        issues.push({
          path: `coreSlides.${index}.claimIds`,
          message: `Claim is not approved for investors: ${claimId}`,
        });
      } else if (claim.statement !== slide.dominantSentence) {
        issues.push({
          path: `coreSlides.${index}.dominantSentence`,
          message: `Dominant sentence must exactly match claim: ${claimId}`,
        });
      }
    }
  }

  for (const [index, claim] of registry.claims.entries()) {
    if (claim.investorFacing && claim.status === 'unverified') {
      issues.push({
        path: `claims.${index}.status`,
        message: 'Unverified claims cannot be investor-facing.',
      });
    }
    if (claim.status === 'verified' && claim.provenance.length === 0) {
      issues.push({
        path: `claims.${index}.provenance`,
        message: 'Verified claims require provenance.',
      });
    }
    if (
      claim.classification === 'founder-attested' &&
      (claim.provenance.length === 0 ||
        claim.provenance.some(
          source =>
            source.classification !== 'founder-authored' ||
            source.href.startsWith('/pitch') ||
            source.href.startsWith('/investor-portal')
        ))
    ) {
      issues.push({
        path: `claims.${index}.provenance`,
        message:
          'Founder-attested claims require a founder-authored source outside the pitch itself.',
      });
    }
    for (const [sourceIndex, source] of claim.provenance.entries()) {
      if (!/^\d{4}-\d{2}-\d{2}$/u.test(source.accessedAt)) {
        issues.push({
          path: `claims.${index}.provenance.${sourceIndex}.accessedAt`,
          message: 'Provenance requires an ISO access date.',
        });
      }
    }
  }

  for (const [index, risk] of registry.risks.entries()) {
    if (!gapClassifications.has(risk.gapClassification)) {
      issues.push({
        path: `risks.${index}.gapClassification`,
        message: 'Risks require a valid gap classification.',
      });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(risk.lastUpdated)) {
      issues.push({
        path: `risks.${index}.lastUpdated`,
        message: 'Risks require an ISO update date.',
      });
    }
    for (const claimId of risk.supportingClaimIds) {
      if (!claimIds.has(claimId)) {
        issues.push({
          path: `risks.${index}.supportingClaimIds`,
          message: `Unknown claim: ${claimId}`,
        });
      }
    }
    for (const slideId of risk.affectedSlideIds) {
      if (!slideIds.has(slideId)) {
        issues.push({
          path: `risks.${index}.affectedSlideIds`,
          message: `Unknown slide: ${slideId}`,
        });
      }
    }
    if (risk.portalSections.length === 0) {
      issues.push({
        path: `risks.${index}.portalSections`,
        message: 'Risks require at least one affected portal section.',
      });
    }
  }

  return issues;
}
