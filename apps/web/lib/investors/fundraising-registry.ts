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
export type OperatingStatus = 'LIVE' | 'DEMO' | 'MANUAL' | 'PLANNED';
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

const AS_OF = '2026-07-11';

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
  support: string,
  claimId: string
): CoreSlide {
  return { id, dominantSentence, support: [support], claimIds: [claimId] };
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

export const fundraisingRegistry = {
  version: '1.0.0',
  asOf: AS_OF,
  thesis:
    'Jovie is building the operating layer that turns a music release into coordinated, measurable marketing work.',
  companyDefinition:
    'An AI marketing operator for music creators, beginning with release workflows.',
  claims: [
    claim(
      'product-demo-exists',
      'A recorded product demonstration is available with captions and a reproducible in-product recording surface.',
      'verified',
      [
        source(
          'Demo video asset',
          '/demo/jovie-demo.mp4',
          'first-party-artifact'
        ),
        source('Caption file', '/demo/jovie-demo.vtt', 'first-party-artifact'),
      ],
      true,
      'verified-fact'
    ),
    claim(
      'release-workflow-focus',
      'The current product and demonstration are organized around release planning and execution surfaces.',
      'verified',
      [source('Product demonstration', '/demo/video', 'first-party-artifact')],
      true,
      'verified-fact'
    ),
    claim(
      'slide-thesis',
      'The next bottleneck in music is not making a song; it is operating the release around it.',
      'internal',
      [],
      true,
      'thesis'
    ),
    claim(
      'slide-problem',
      'Artists are asked to become a marketing department every time they release.',
      'internal',
      [],
      true,
      'thesis'
    ),
    claim(
      'slide-wedge',
      'Jovie starts with one bounded job: turn release context into an executable launch plan.',
      'internal',
      [],
      true,
      'plan'
    ),
    claim(
      'slide-product',
      'The product keeps the release, its opportunities, and the work to ship in one operating surface.',
      'verified',
      [source('Product demonstration', '/demo/video', 'first-party-artifact')],
      true,
      'verified-fact'
    ),
    claim(
      'slide-loop',
      'The durable loop is context in, approved work out, outcomes back into the next release.',
      'internal',
      [],
      true,
      'plan'
    ),
    claim(
      'founder-artist-operator',
      'Founder-provided account: Jovie is being built by the person who needed this operating system as an artist.',
      'internal',
      [
        source(
          'The Friday Problem by Tim White',
          '/blog/the-friday-problem',
          'founder-authored'
        ),
      ],
      true,
      'founder-attested'
    ),
    claim(
      'slide-round',
      'This round is for proving that release execution becomes a repeatable, paid creator workflow.',
      'internal',
      [],
      true,
      'plan'
    ),
    claim(
      'closed-loop-category-context',
      'YC describes an AI operating system as a connective intelligence layer that can monitor outcomes, compare actual with desired results, and adjust.',
      'verified',
      [
        source(
          'YC Summer 2026 Requests for Startups',
          'https://www.ycombinator.com/rfs',
          'external-context'
        ),
      ],
      false,
      'verified-fact'
    ),
  ],
  coreSlides: [
    slide(
      'thesis',
      'The next bottleneck in music is not making a song; it is operating the release around it.',
      'Release work is fragmented across planning, creative, links, audience communication, and measurement.',
      'slide-thesis'
    ),
    slide(
      'problem',
      'Artists are asked to become a marketing department every time they release.',
      'The work repeats, context is lost between tools, and execution competes with the music itself.',
      'slide-problem'
    ),
    slide(
      'wedge',
      'Jovie starts with one bounded job: turn release context into an executable launch plan.',
      'A narrow release workflow makes inputs, approvals, outputs, and outcomes inspectable.',
      'slide-wedge'
    ),
    slide(
      'product',
      'The product keeps the release, its opportunities, and the work to ship in one operating surface.',
      'The current demo shows the product experience; it is not presented as customer traction.',
      'slide-product'
    ),
    slide(
      'loop',
      'The durable loop is context in, approved work out, outcomes back into the next release.',
      'Today that loop spans live product surfaces, demonstration states, manual execution, and planned automation.',
      'slide-loop'
    ),
    slide(
      'founder',
      'Founder-provided account: Jovie is being built by the person who needed this operating system as an artist.',
      'Founder-market fit is the current advantage; repeatable distribution and retention still need proof.',
      'founder-artist-operator'
    ),
    slide(
      'round',
      'This round is for proving that release execution becomes a repeatable, paid creator workflow.',
      'The next evidence is paid activation, repeated use across releases, and measurable time or revenue impact.',
      'slide-round'
    ),
  ],
  operatingLoop: [
    operatingStep(
      'catalog-context',
      'LIVE',
      'Collect Release Context',
      'Jovie has product surfaces for creator, catalog, and release information.'
    ),
    operatingStep(
      'opportunity',
      'DEMO',
      'Surface The Opportunity',
      'The recorded walkthrough demonstrates how context becomes a release opportunity.'
    ),
    operatingStep(
      'execution',
      'MANUAL',
      'Approve And Ship The Work',
      'Human review and manual operations remain part of the current execution path.'
    ),
    operatingStep(
      'learning',
      'PLANNED',
      'Learn From Outcomes',
      'A closed outcome-to-recommendation learning loop is the product direction, not a claimed production capability.'
    ),
  ],
  founderLetter: [
    'I started Jovie because releasing music repeatedly forced me to rebuild the same small marketing operation. The song had context, but the tools did not. Plans lived in documents, links in separate products, and the next action depended on someone remembering what mattered.',
    'The first version of Jovie is intentionally narrower than the long-term vision. It organizes a release, surfaces the work around it, and gives the artist one place to review what should ship. Some of that experience is live, some is demonstrated, and some execution is still manual. This portal labels those boundaries directly.',
    'The company becomes durable only if it can learn from what was approved, shipped, and effective across releases. The work of this round is to prove that loop with paying creators—not to ask investors to treat the roadmap as traction.',
  ],
  risks: [
    risk(
      'product-readiness',
      'How much of the agent is live today?',
      'Release and creator surfaces exist. The walkthrough includes demonstration states, execution still includes manual work, and outcome-driven learning is planned.',
      'critical',
      'A production capability matrix verified against deployed behavior.',
      'evidence',
      ['product-demo-exists', 'release-workflow-focus'],
      ['product', 'loop'],
      ['demo', 'operating-loop'],
      'Verify each demonstrated capability against deployed behavior and record its operating status.',
      'Keep the capability labels adjacent to the demo and operating loop.'
    ),
    risk(
      'traction',
      'What customer traction is proven?',
      'This portal does not claim customer, revenue, conversion, or retention metrics because current evidence has not been approved for publication.',
      'critical',
      'Dated customer, revenue, activation, and retention evidence.',
      'evidence',
      [],
      ['product', 'round'],
      ['brief', 'questions'],
      'Define and collect dated activation, paid usage, and repeat-release cohorts.',
      'Continue stating that the demo is not traction until reviewed cohorts exist.'
    ),
    risk(
      'gtm',
      'How will Jovie acquire creators?',
      'Founder-led artist outreach and pre-built creator context are hypotheses to test; a repeatable paid acquisition or sales motion is not yet claimed.',
      'critical',
      'A defined outreach-to-paid funnel with cohort counts.',
      'strategy',
      [],
      ['round'],
      ['questions'],
      'Run a bounded founder-led outreach cohort and measure each funnel transition.',
      'Describe acquisition as a hypothesis and show only observed funnel counts.'
    ),
    risk(
      'market',
      'Is the market venture-scale?',
      'The thesis is that release operations can expand into recurring creator marketing execution. This version intentionally omits unsupported top-down market arithmetic.',
      'high',
      'Bottom-up buyer counts, willingness to pay, and expansion sensitivity.',
      'evidence',
      [],
      ['thesis', 'round'],
      ['brief', 'questions'],
      'Build a bottom-up model from a defined buyer, observed willingness to pay, and reachable distribution.',
      'Omit top-down arithmetic until its inputs and sensitivities are reviewable.'
    ),
    risk(
      'business-model',
      'Who pays, and for what?',
      'The working hypothesis is creator-paid software for recurring release operations. Pricing and packaging remain validation questions.',
      'critical',
      'Paid pilots and willingness-to-pay interviews tied to a specific package.',
      'strategy',
      ['release-workflow-focus'],
      ['wedge', 'round'],
      ['brief', 'questions'],
      'Test one creator-paid release-operations package through paid pilots.',
      'Label pricing and packaging as a working hypothesis until payment evidence exists.'
    ),
    risk(
      'moat',
      'Why will this not become a feature?',
      'The proposed advantage is accumulated release context, approval history, execution reliability, and outcome data. That compounding advantage is not yet proven.',
      'high',
      'Evidence that repeated use improves execution or creates switching costs.',
      'strategy',
      ['closed-loop-category-context'],
      ['loop'],
      ['operating-loop', 'questions'],
      'Measure whether retained release context improves repeated execution or creates switching costs.',
      'Present the compounding loop as the proposed advantage, not a proven moat.'
    ),
    risk(
      'platform-dependency',
      'How exposed is Jovie to music and social platforms?',
      'Jovie depends on third-party catalog, audience, commerce, and messaging surfaces. The product must preserve first-party creator context and degrade safely when integrations change.',
      'high',
      'A dependency matrix with permissions, fallbacks, and owned data boundaries.',
      'evidence',
      [],
      ['product', 'loop'],
      ['operating-loop', 'questions'],
      'Document platform permissions, failure modes, fallbacks, and first-party data ownership.',
      'State the dependency boundary and fallback posture without implying platform guarantees.'
    ),
    risk(
      'ai-commoditization',
      'What remains valuable as generation gets cheaper?',
      'Copy generation is not the moat. The bet is on trustworthy context, approvals, execution, and measured outcomes.',
      'high',
      'Production proof of execution quality and outcome capture.',
      'strategy',
      ['closed-loop-category-context'],
      ['wedge', 'loop'],
      ['operating-loop', 'questions'],
      'Prove value in context, approvals, reliable execution, and measured outcomes rather than generation.',
      'Keep generative output separate from the proposed operating-system advantage.'
    ),
    risk(
      'founder-dependency',
      'Can the workflow scale beyond the founder?',
      'Founder expertise is currently an advantage and a concentration risk. Manual decisions must become explicit product rules and repeatable operations.',
      'high',
      'Non-founder operation of the workflow with consistent quality.',
      'evidence',
      ['founder-artist-operator'],
      ['founder'],
      ['founder-letter', 'questions'],
      'Have a non-founder operate the documented workflow and compare quality and completion.',
      'Present founder expertise as both an advantage and a concentration risk.'
    ),
    risk(
      'capital',
      'What does new capital prove?',
      'The intended proof is paid activation, repeated release use, and measurable creator value. Round size and terms are kept out until approved evidence is current.',
      'critical',
      'Approved raise terms, milestone budget, and runway model.',
      'evidence',
      [],
      ['round'],
      ['brief', 'questions'],
      'Approve a milestone budget and runway model tied to paid activation and repeated release use.',
      'Keep round size and terms out of the portal until the approved model is current.'
    ),
  ],
  appendix: [
    appendixItem(
      'narrative-boundary',
      'Narrative Boundary',
      'The core brief distinguishes verified facts, founder-attested context, thesis, and plans.'
    ),
    appendixItem(
      'risk-register',
      'Risk Register',
      'The questions above map to explicit evidence, strategy, communication, and investor-fit gaps.'
    ),
    appendixItem(
      'evidence',
      'Evidence Boundary',
      'Metrics, terms, market estimates, and customer outcomes remain excluded until their provenance is reviewed.'
    ),
  ],
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
    'Approved round terms, milestone budget, and runway.',
    'Measured outcomes from a complete release loop.',
  ],
  changeHistory: [
    {
      date: AS_OF,
      summary:
        'Established the typed canonical registry and removed unsupported numeric claims from the core investor narrative.',
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
            source.href.startsWith('/pitch')
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
