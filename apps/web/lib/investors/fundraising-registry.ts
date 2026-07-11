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

export const fundraisingRegistry = {
  version: '1.0.0',
  asOf: '2026-07-11',
  thesis:
    'Jovie is building the operating layer that turns a music release into coordinated, measurable marketing work.',
  companyDefinition:
    'An AI marketing operator for music creators, beginning with release workflows.',
  claims: [
    {
      id: 'product-demo-exists',
      statement:
        'A recorded product demonstration is available with captions and a reproducible in-product recording surface.',
      status: 'verified',
      provenance: [
        {
          label: 'Demo video asset',
          href: '/demo/jovie-demo.mp4',
          accessedAt: '2026-07-11',
          classification: 'first-party-artifact',
        },
        {
          label: 'Caption file',
          href: '/demo/jovie-demo.vtt',
          accessedAt: '2026-07-11',
          classification: 'first-party-artifact',
        },
      ],
      investorFacing: true,
      classification: 'verified-fact',
    },
    {
      id: 'release-workflow-focus',
      statement:
        'The current product and demonstration are organized around release planning and execution surfaces.',
      status: 'verified',
      provenance: [
        {
          label: 'Product demonstration',
          href: '/demo/video',
          accessedAt: '2026-07-11',
          classification: 'first-party-artifact',
        },
      ],
      investorFacing: true,
      classification: 'verified-fact',
    },
    {
      id: 'slide-thesis',
      statement:
        'The next bottleneck in music is not making a song; it is operating the release around it.',
      status: 'internal',
      provenance: [],
      investorFacing: true,
      classification: 'thesis',
    },
    {
      id: 'slide-problem',
      statement:
        'Artists are asked to become a marketing department every time they release.',
      status: 'internal',
      provenance: [],
      investorFacing: true,
      classification: 'thesis',
    },
    {
      id: 'slide-wedge',
      statement:
        'Jovie starts with one bounded job: turn release context into an executable launch plan.',
      status: 'internal',
      provenance: [],
      investorFacing: true,
      classification: 'plan',
    },
    {
      id: 'slide-product',
      statement:
        'The product keeps the release, its opportunities, and the work to ship in one operating surface.',
      status: 'verified',
      provenance: [
        {
          label: 'Product demonstration',
          href: '/demo/video',
          accessedAt: '2026-07-11',
          classification: 'first-party-artifact',
        },
      ],
      investorFacing: true,
      classification: 'verified-fact',
    },
    {
      id: 'slide-loop',
      statement:
        'The durable loop is context in, approved work out, outcomes back into the next release.',
      status: 'internal',
      provenance: [],
      investorFacing: true,
      classification: 'plan',
    },
    {
      id: 'founder-artist-operator',
      statement:
        'Founder-provided account: Jovie is being built by the person who needed this operating system as an artist.',
      status: 'internal',
      provenance: [
        {
          label: 'The Friday Problem by Tim White',
          href: '/blog/the-friday-problem',
          accessedAt: '2026-07-11',
          classification: 'founder-authored',
        },
      ],
      investorFacing: true,
      classification: 'founder-attested',
    },
    {
      id: 'slide-round',
      statement:
        'This round is for proving that release execution becomes a repeatable, paid creator workflow.',
      status: 'internal',
      provenance: [],
      investorFacing: true,
      classification: 'plan',
    },
    {
      id: 'closed-loop-category-context',
      statement:
        'YC describes an AI operating system as a connective intelligence layer that can monitor outcomes, compare actual with desired results, and adjust.',
      status: 'verified',
      provenance: [
        {
          label: 'YC Summer 2026 Requests for Startups',
          href: 'https://www.ycombinator.com/rfs',
          accessedAt: '2026-07-11',
          classification: 'external-context',
        },
      ],
      investorFacing: false,
      classification: 'verified-fact',
    },
  ],
  coreSlides: [
    {
      id: 'thesis',
      dominantSentence:
        'The next bottleneck in music is not making a song; it is operating the release around it.',
      support: [
        'Release work is fragmented across planning, creative, links, audience communication, and measurement.',
      ],
      claimIds: ['slide-thesis'],
    },
    {
      id: 'problem',
      dominantSentence:
        'Artists are asked to become a marketing department every time they release.',
      support: [
        'The work repeats, context is lost between tools, and execution competes with the music itself.',
      ],
      claimIds: ['slide-problem'],
    },
    {
      id: 'wedge',
      dominantSentence:
        'Jovie starts with one bounded job: turn release context into an executable launch plan.',
      support: [
        'A narrow release workflow makes inputs, approvals, outputs, and outcomes inspectable.',
      ],
      claimIds: ['slide-wedge'],
    },
    {
      id: 'product',
      dominantSentence:
        'The product keeps the release, its opportunities, and the work to ship in one operating surface.',
      support: [
        'The current demo shows the product experience; it is not presented as customer traction.',
      ],
      claimIds: ['slide-product'],
    },
    {
      id: 'loop',
      dominantSentence:
        'The durable loop is context in, approved work out, outcomes back into the next release.',
      support: [
        'Today that loop spans live product surfaces, demonstration states, manual execution, and planned automation.',
      ],
      claimIds: ['slide-loop'],
    },
    {
      id: 'founder',
      dominantSentence:
        'Founder-provided account: Jovie is being built by the person who needed this operating system as an artist.',
      support: [
        'Founder-market fit is the current advantage; repeatable distribution and retention still need proof.',
      ],
      claimIds: ['founder-artist-operator'],
    },
    {
      id: 'round',
      dominantSentence:
        'This round is for proving that release execution becomes a repeatable, paid creator workflow.',
      support: [
        'The next evidence is paid activation, repeated use across releases, and measurable time or revenue impact.',
      ],
      claimIds: ['slide-round'],
    },
  ],
  operatingLoop: [
    {
      id: 'catalog-context',
      status: 'LIVE',
      title: 'Collect Release Context',
      description:
        'Jovie has product surfaces for creator, catalog, and release information.',
    },
    {
      id: 'opportunity',
      status: 'DEMO',
      title: 'Surface The Opportunity',
      description:
        'The recorded walkthrough demonstrates how context becomes a release opportunity.',
    },
    {
      id: 'execution',
      status: 'MANUAL',
      title: 'Approve And Ship The Work',
      description:
        'Human review and manual operations remain part of the current execution path.',
    },
    {
      id: 'learning',
      status: 'PLANNED',
      title: 'Learn From Outcomes',
      description:
        'A closed outcome-to-recommendation learning loop is the product direction, not a claimed production capability.',
    },
  ],
  founderLetter: [
    'I started Jovie because releasing music repeatedly forced me to rebuild the same small marketing operation. The song had context, but the tools did not. Plans lived in documents, links in separate products, and the next action depended on someone remembering what mattered.',
    'The first version of Jovie is intentionally narrower than the long-term vision. It organizes a release, surfaces the work around it, and gives the artist one place to review what should ship. Some of that experience is live, some is demonstrated, and some execution is still manual. This portal labels those boundaries directly.',
    'The company becomes durable only if it can learn from what was approved, shipped, and effective across releases. The work of this round is to prove that loop with paying creators—not to ask investors to treat the roadmap as traction.',
  ],
  risks: [
    {
      id: 'product-readiness',
      question: 'How much of the agent is live today?',
      answer:
        'Release and creator surfaces exist. The walkthrough includes demonstration states, execution still includes manual work, and outcome-driven learning is planned.',
      severity: 'critical',
      evidenceGap:
        'A production capability matrix verified against deployed behavior.',
      frequency: 'unknown',
      gapClassification: 'evidence',
      supportingClaimIds: ['product-demo-exists', 'release-workflow-focus'],
      affectedSlideIds: ['product', 'loop'],
      portalSections: ['demo', 'operating-loop'],
      recommendedCompanyAction:
        'Verify each demonstrated capability against deployed behavior and record its operating status.',
      recommendedCommunicationAction:
        'Keep the capability labels adjacent to the demo and operating loop.',
      lastUpdated: '2026-07-11',
    },
    {
      id: 'traction',
      question: 'What customer traction is proven?',
      answer:
        'This portal does not claim customer, revenue, conversion, or retention metrics because current evidence has not been approved for publication.',
      severity: 'critical',
      evidenceGap:
        'Dated customer, revenue, activation, and retention evidence.',
      frequency: 'unknown',
      gapClassification: 'evidence',
      supportingClaimIds: [],
      affectedSlideIds: ['product', 'round'],
      portalSections: ['brief', 'questions'],
      recommendedCompanyAction:
        'Define and collect dated activation, paid usage, and repeat-release cohorts.',
      recommendedCommunicationAction:
        'Continue stating that the demo is not traction until reviewed cohorts exist.',
      lastUpdated: '2026-07-11',
    },
    {
      id: 'gtm',
      question: 'How will Jovie acquire creators?',
      answer:
        'Founder-led artist outreach and pre-built creator context are hypotheses to test; a repeatable paid acquisition or sales motion is not yet claimed.',
      severity: 'critical',
      evidenceGap: 'A defined outreach-to-paid funnel with cohort counts.',
      frequency: 'unknown',
      gapClassification: 'strategy',
      supportingClaimIds: [],
      affectedSlideIds: ['round'],
      portalSections: ['questions'],
      recommendedCompanyAction:
        'Run a bounded founder-led outreach cohort and measure each funnel transition.',
      recommendedCommunicationAction:
        'Describe acquisition as a hypothesis and show only observed funnel counts.',
      lastUpdated: '2026-07-11',
    },
    {
      id: 'market',
      question: 'Is the market venture-scale?',
      answer:
        'The thesis is that release operations can expand into recurring creator marketing execution. This version intentionally omits unsupported top-down market arithmetic.',
      severity: 'high',
      evidenceGap:
        'Bottom-up buyer counts, willingness to pay, and expansion sensitivity.',
      frequency: 'unknown',
      gapClassification: 'evidence',
      supportingClaimIds: [],
      affectedSlideIds: ['thesis', 'round'],
      portalSections: ['brief', 'questions'],
      recommendedCompanyAction:
        'Build a bottom-up model from a defined buyer, observed willingness to pay, and reachable distribution.',
      recommendedCommunicationAction:
        'Omit top-down arithmetic until its inputs and sensitivities are reviewable.',
      lastUpdated: '2026-07-11',
    },
    {
      id: 'business-model',
      question: 'Who pays, and for what?',
      answer:
        'The working hypothesis is creator-paid software for recurring release operations. Pricing and packaging remain validation questions.',
      severity: 'critical',
      evidenceGap:
        'Paid pilots and willingness-to-pay interviews tied to a specific package.',
      frequency: 'unknown',
      gapClassification: 'strategy',
      supportingClaimIds: ['release-workflow-focus'],
      affectedSlideIds: ['wedge', 'round'],
      portalSections: ['brief', 'questions'],
      recommendedCompanyAction:
        'Test one creator-paid release-operations package through paid pilots.',
      recommendedCommunicationAction:
        'Label pricing and packaging as a working hypothesis until payment evidence exists.',
      lastUpdated: '2026-07-11',
    },
    {
      id: 'moat',
      question: 'Why will this not become a feature?',
      answer:
        'The proposed advantage is accumulated release context, approval history, execution reliability, and outcome data. That compounding advantage is not yet proven.',
      severity: 'high',
      evidenceGap:
        'Evidence that repeated use improves execution or creates switching costs.',
      frequency: 'unknown',
      gapClassification: 'strategy',
      supportingClaimIds: ['closed-loop-category-context'],
      affectedSlideIds: ['loop'],
      portalSections: ['operating-loop', 'questions'],
      recommendedCompanyAction:
        'Measure whether retained release context improves repeated execution or creates switching costs.',
      recommendedCommunicationAction:
        'Present the compounding loop as the proposed advantage, not a proven moat.',
      lastUpdated: '2026-07-11',
    },
    {
      id: 'platform-dependency',
      question: 'How exposed is Jovie to music and social platforms?',
      answer:
        'Jovie depends on third-party catalog, audience, commerce, and messaging surfaces. The product must preserve first-party creator context and degrade safely when integrations change.',
      severity: 'high',
      evidenceGap:
        'A dependency matrix with permissions, fallbacks, and owned data boundaries.',
      frequency: 'unknown',
      gapClassification: 'evidence',
      supportingClaimIds: [],
      affectedSlideIds: ['product', 'loop'],
      portalSections: ['operating-loop', 'questions'],
      recommendedCompanyAction:
        'Document platform permissions, failure modes, fallbacks, and first-party data ownership.',
      recommendedCommunicationAction:
        'State the dependency boundary and fallback posture without implying platform guarantees.',
      lastUpdated: '2026-07-11',
    },
    {
      id: 'ai-commoditization',
      question: 'What remains valuable as generation gets cheaper?',
      answer:
        'Copy generation is not the moat. The bet is on trustworthy context, approvals, execution, and measured outcomes.',
      severity: 'high',
      evidenceGap: 'Production proof of execution quality and outcome capture.',
      frequency: 'unknown',
      gapClassification: 'strategy',
      supportingClaimIds: ['closed-loop-category-context'],
      affectedSlideIds: ['wedge', 'loop'],
      portalSections: ['operating-loop', 'questions'],
      recommendedCompanyAction:
        'Prove value in context, approvals, reliable execution, and measured outcomes rather than generation.',
      recommendedCommunicationAction:
        'Keep generative output separate from the proposed operating-system advantage.',
      lastUpdated: '2026-07-11',
    },
    {
      id: 'founder-dependency',
      question: 'Can the workflow scale beyond the founder?',
      answer:
        'Founder expertise is currently an advantage and a concentration risk. Manual decisions must become explicit product rules and repeatable operations.',
      severity: 'high',
      evidenceGap:
        'Non-founder operation of the workflow with consistent quality.',
      frequency: 'unknown',
      gapClassification: 'evidence',
      supportingClaimIds: ['founder-artist-operator'],
      affectedSlideIds: ['founder'],
      portalSections: ['founder-letter', 'questions'],
      recommendedCompanyAction:
        'Have a non-founder operate the documented workflow and compare quality and completion.',
      recommendedCommunicationAction:
        'Present founder expertise as both an advantage and a concentration risk.',
      lastUpdated: '2026-07-11',
    },
    {
      id: 'capital',
      question: 'What does new capital prove?',
      answer:
        'The intended proof is paid activation, repeated release use, and measurable creator value. Round size and terms are kept out until approved evidence is current.',
      severity: 'critical',
      evidenceGap: 'Approved raise terms, milestone budget, and runway model.',
      frequency: 'unknown',
      gapClassification: 'evidence',
      supportingClaimIds: [],
      affectedSlideIds: ['round'],
      portalSections: ['brief', 'questions'],
      recommendedCompanyAction:
        'Approve a milestone budget and runway model tied to paid activation and repeated release use.',
      recommendedCommunicationAction:
        'Keep round size and terms out of the portal until the approved model is current.',
      lastUpdated: '2026-07-11',
    },
  ],
  appendix: [
    {
      id: 'narrative-boundary',
      title: 'Narrative Boundary',
      body: 'The core brief distinguishes verified facts, founder-attested context, thesis, and plans.',
    },
    {
      id: 'risk-register',
      title: 'Risk Register',
      body: 'The questions above map to explicit evidence, strategy, communication, and investor-fit gaps.',
    },
    {
      id: 'evidence',
      title: 'Evidence Boundary',
      body: 'Metrics, terms, market estimates, and customer outcomes remain excluded until their provenance is reviewed.',
    },
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
      date: '2026-07-11',
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
