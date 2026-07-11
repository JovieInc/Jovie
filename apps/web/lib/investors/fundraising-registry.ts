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

export interface FundraisingMetric {
  readonly id: string;
  readonly label: string;
  readonly value: string | null;
  readonly status: EvidenceStatus | 'evidence-gap';
  readonly provenance: readonly ClaimProvenance[];
  readonly lastUpdated: string;
}

export interface InvestorConversationSummary {
  readonly sourceId: string;
  readonly transcriptSha256: string;
  readonly capturedAt: string;
  readonly summary: string;
}

export interface InvestorFaqEntry {
  readonly riskId: string;
  readonly riskLastUpdated: string;
  readonly question: string;
  readonly answer: string;
}

export interface CompanyOperatingMetric {
  readonly id: string;
  readonly label: string;
  readonly value: null;
  readonly status: 'evidence-gap';
  readonly evidenceGap: string;
  readonly instrumentationPlan: string;
  readonly lastUpdated: string;
}

export interface FundraisingRegistry {
  readonly version: string;
  readonly asOf: string;
  readonly thesis: string;
  readonly companyDefinition: string;
  readonly currentNarrative: string;
  readonly metrics: readonly FundraisingMetric[];
  readonly researchSources: readonly ClaimProvenance[];
  readonly investorConversationSummaries: readonly InvestorConversationSummary[];
  readonly investorFaq: readonly InvestorFaqEntry[];
  readonly companyOperatingMetrics: readonly CompanyOperatingMetric[];
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

type ClaimInput = Parameters<typeof claim>;
type SlideInput = Parameters<typeof slide>;
type OperatingStepInput = Parameters<typeof operatingStep>;
type RiskInput = Parameters<typeof risk>;
type AppendixInput = Parameters<typeof appendixItem>;

// biome-ignore format: One content record per line prevents structural duplication while keeping review diffs readable.
const CLAIM_DATA = [
  ['product-demo-exists', 'A recorded product demonstration is available with captions and a reproducible in-product recording surface.', 'verified', [source('Demo video asset', '/demo/jovie-demo.mp4', 'first-party-artifact'), source('Caption file', '/demo/jovie-demo.vtt', 'first-party-artifact')], true, 'verified-fact'],
  ['release-workflow-focus', 'The current product and demonstration are organized around release planning and execution surfaces.', 'verified', [source('Product demonstration', '/demo/video', 'first-party-artifact')], true, 'verified-fact'],
  ['slide-thesis', 'The next bottleneck in music is not making a song; it is operating the release around it.', 'internal', [], true, 'thesis'],
  ['slide-problem', 'Artists are asked to become a marketing department every time they release.', 'internal', [], true, 'thesis'],
  ['slide-wedge', 'Jovie starts with one bounded job: turn release context into an executable launch plan.', 'internal', [], true, 'plan'],
  ['slide-product', 'The product keeps the release, its opportunities, and the work to ship in one operating surface.', 'verified', [source('Product demonstration', '/demo/video', 'first-party-artifact')], true, 'verified-fact'],
  ['slide-loop', 'The durable loop is context in, approved work out, outcomes back into the next release.', 'internal', [], true, 'plan'],
  ['founder-artist-operator', 'Founder-provided account: Jovie is being built by the person who needed this operating system as an artist.', 'internal', [source('The Friday Problem by Tim White', '/blog/the-friday-problem', 'founder-authored')], true, 'founder-attested'],
  ['slide-round', 'This round is for proving that release execution becomes a repeatable, paid creator workflow.', 'internal', [], true, 'plan'],
  ['closed-loop-category-context', 'YC describes an AI operating system as a connective intelligence layer that can monitor outcomes, compare actual with desired results, and adjust.', 'verified', [source('YC Summer 2026 Requests for Startups', 'https://www.ycombinator.com/rfs', 'external-context')], false, 'verified-fact'],
] as const satisfies readonly ClaimInput[];

// biome-ignore format: One content record per line prevents structural duplication while keeping review diffs readable.
const SLIDE_DATA = [
  ['thesis', 'The next bottleneck in music is not making a song; it is operating the release around it.', 'Release work is fragmented across planning, creative, links, audience communication, and measurement.', 'slide-thesis'],
  ['problem', 'Artists are asked to become a marketing department every time they release.', 'The work repeats, context is lost between tools, and execution competes with the music itself.', 'slide-problem'],
  ['wedge', 'Jovie starts with one bounded job: turn release context into an executable launch plan.', 'A narrow release workflow makes inputs, approvals, outputs, and outcomes inspectable.', 'slide-wedge'],
  ['product', 'The product keeps the release, its opportunities, and the work to ship in one operating surface.', 'The current demo shows the product experience; it is not presented as customer traction.', 'slide-product'],
  ['loop', 'The durable loop is context in, approved work out, outcomes back into the next release.', 'Today that loop spans live product surfaces, demonstration states, manual execution, and planned automation.', 'slide-loop'],
  ['founder', 'Founder-provided account: Jovie is being built by the person who needed this operating system as an artist.', 'Founder-market fit is the current advantage; repeatable distribution and retention still need proof.', 'founder-artist-operator'],
  ['round', 'This round is for proving that release execution becomes a repeatable, paid creator workflow.', 'The next evidence is paid activation, repeated use across releases, and measurable time or revenue impact.', 'slide-round'],
] as const satisfies readonly SlideInput[];

// biome-ignore format: One content record per line prevents structural duplication while keeping review diffs readable.
const OPERATING_STEP_DATA = [
  ['catalog-context', 'LIVE', 'Collect Release Context', 'Jovie has product surfaces for creator, catalog, and release information.'],
  ['opportunity', 'DEMO', 'Surface The Opportunity', 'The recorded walkthrough demonstrates how context becomes a release opportunity.'],
  ['execution', 'MANUAL', 'Approve And Ship The Work', 'Human review and manual operations remain part of the current execution path.'],
  ['learning', 'PLANNED', 'Learn From Outcomes', 'A closed outcome-to-recommendation learning loop is the product direction, not a claimed production capability.'],
] as const satisfies readonly OperatingStepInput[];

// biome-ignore format: One content record per line prevents structural duplication while keeping review diffs readable.
const RISK_DATA = [
  ['product-readiness', 'How much of the agent is live today?', 'Release and creator surfaces exist. The walkthrough includes demonstration states, execution still includes manual work, and outcome-driven learning is planned.', 'critical', 'A production capability matrix verified against deployed behavior.', 'evidence', ['product-demo-exists', 'release-workflow-focus'], ['product', 'loop'], ['demo', 'operating-loop'], 'Verify each demonstrated capability against deployed behavior and record its operating status.', 'Keep the capability labels adjacent to the demo and operating loop.'],
  ['traction', 'What customer traction is proven?', 'This portal does not claim customer, revenue, conversion, or retention metrics because current evidence has not been approved for publication.', 'critical', 'Dated customer, revenue, activation, and retention evidence.', 'evidence', [], ['product', 'round'], ['brief', 'questions'], 'Define and collect dated activation, paid usage, and repeat-release cohorts.', 'Continue stating that the demo is not traction until reviewed cohorts exist.'],
  ['gtm', 'How will Jovie acquire creators?', 'Founder-led artist outreach and pre-built creator context are hypotheses to test; a repeatable paid acquisition or sales motion is not yet claimed.', 'critical', 'A defined outreach-to-paid funnel with cohort counts.', 'strategy', [], ['round'], ['questions'], 'Run a bounded founder-led outreach cohort and measure each funnel transition.', 'Describe acquisition as a hypothesis and show only observed funnel counts.'],
  ['market', 'Is the market venture-scale?', 'The thesis is that release operations can expand into recurring creator marketing execution. This version intentionally omits unsupported top-down market arithmetic.', 'high', 'Bottom-up buyer counts, willingness to pay, and expansion sensitivity.', 'evidence', [], ['thesis', 'round'], ['brief', 'questions'], 'Build a bottom-up model from a defined buyer, observed willingness to pay, and reachable distribution.', 'Omit top-down arithmetic until its inputs and sensitivities are reviewable.'],
  ['business-model', 'Who pays, and for what?', 'The working hypothesis is creator-paid software for recurring release operations. Pricing and packaging remain validation questions.', 'critical', 'Paid pilots and willingness-to-pay interviews tied to a specific package.', 'strategy', ['release-workflow-focus'], ['wedge', 'round'], ['brief', 'questions'], 'Test one creator-paid release-operations package through paid pilots.', 'Label pricing and packaging as a working hypothesis until payment evidence exists.'],
  ['moat', 'Why will this not become a feature?', 'The proposed advantage is accumulated release context, approval history, execution reliability, and outcome data. That compounding advantage is not yet proven.', 'high', 'Evidence that repeated use improves execution or creates switching costs.', 'strategy', ['closed-loop-category-context'], ['loop'], ['operating-loop', 'questions'], 'Measure whether retained release context improves repeated execution or creates switching costs.', 'Present the compounding loop as the proposed advantage, not a proven moat.'],
  ['platform-dependency', 'How exposed is Jovie to music, social, and AI providers?', 'Jovie depends on third-party music, social, commerce, messaging, and AI-provider APIs. Provider substitution, outages, permissions changes, and model or API changes must degrade safely while preserving first-party creator data boundaries.', 'high', 'A dependency matrix covering each provider category, API substitution, outages, permissions, owned data boundaries, and tested fallbacks.', 'evidence', [], ['product', 'loop'], ['operating-loop', 'questions'], 'Document music, social, commerce, messaging, and AI providers; test substitution and outage paths; record permissions, first-party data boundaries, and fallbacks.', 'State provider dependencies, substitution limits, outage behavior, permissions, data boundaries, and fallbacks without implying guarantees.'],
  ['ai-commoditization', 'What remains valuable as generation gets cheaper?', 'Copy generation is not the moat. The bet is on trustworthy context, approvals, execution, and measured outcomes.', 'high', 'Production proof of execution quality and outcome capture.', 'strategy', ['closed-loop-category-context'], ['wedge', 'loop'], ['operating-loop', 'questions'], 'Prove value in context, approvals, reliable execution, and measured outcomes rather than generation.', 'Keep generative output separate from the proposed operating-system advantage.'],
  ['founder-dependency', 'Can the workflow scale beyond the founder?', 'Founder expertise is currently an advantage and a concentration risk. Manual decisions must become explicit product rules and repeatable operations.', 'high', 'Non-founder operation of the workflow with consistent quality.', 'evidence', ['founder-artist-operator'], ['founder'], ['founder-letter', 'questions'], 'Have a non-founder operate the documented workflow and compare quality and completion.', 'Present founder expertise as both an advantage and a concentration risk.'],
  ['capital', 'What does new capital prove?', 'The intended proof is paid activation, repeated release use, and measurable creator value. Round size and terms are kept out until approved evidence is current.', 'critical', 'Approved raise terms, milestone budget, and runway model.', 'evidence', [], ['round'], ['brief', 'questions'], 'Approve a milestone budget and runway model tied to paid activation and repeated release use.', 'Keep round size and terms out of the portal until the approved model is current.'],
  ['why-now', 'Why is now the right time to build Jovie?', 'The timing thesis is that cheaper AI generation increases the volume of possible marketing work while creator release operations remain fragmented. Jovie has not yet proven that this timing produces urgent paid demand.', 'high', 'Dated buyer evidence that AI-driven content volume increases release-operations pain or purchase urgency.', 'evidence', ['slide-problem', 'closed-loop-category-context'], ['thesis', 'problem'], ['brief', 'questions'], 'Test timing and urgency explicitly in paid-pilot and buyer interviews.', 'Present why-now as a testable timing thesis, not a market fact.'],
  ['why-founder', 'Why is this founder uniquely positioned to win?', 'The founder has an attested artist-operator problem history and built the current product. Unique distribution, execution velocity, and repeatable company-building advantage remain unproven.', 'high', 'Dated evidence of founder-led distribution, shipping velocity, or outcomes that competitors cannot readily reproduce.', 'evidence', ['founder-artist-operator', 'product-demo-exists'], ['founder'], ['founder-letter', 'questions'], 'Document dated founder execution and distribution evidence outside the pitch.', 'Separate the sourced artist-operator history from still-unproven founder advantage.'],
  ['willingness-to-pay', 'Will creators both want and be able to pay for this workflow?', 'No approved willingness-to-pay, budget, or paid-pilot evidence is currently available. Creator-paid software is a working hypothesis.', 'critical', 'Segmented price discovery, budget evidence, and completed paid pilots.', 'evidence', ['release-workflow-focus'], ['wedge', 'round'], ['brief', 'questions'], 'Run priced offers with a defined creator segment and record acceptance, refusal, and budget constraints.', 'Do not infer willingness or ability to pay from product interest.'],
  ['small-team-support', 'Can a small team support creator customers without becoming an agency?', 'Execution still includes manual work, so service load and support economics are not yet known. The product must make approvals and operations repeatable without hiding founder labor.', 'critical', 'Time-per-customer, support volume, exception rate, and gross-margin evidence from repeated release cohorts.', 'strategy', ['release-workflow-focus'], ['product', 'loop', 'round'], ['operating-loop', 'questions'], 'Instrument human time, exceptions, and support work per active release and set a service-load ceiling.', 'Label manual work and avoid presenting founder-operated service as software scalability.'],
  ['closed-loop-credibility', 'Why should investors believe the closed-loop model will work?', 'The current registry distinguishes live context surfaces, a demonstrated opportunity flow, manual execution, and planned outcome learning. The complete loop has not been verified in production.', 'critical', 'End-to-end records showing approved work, shipped execution, measured outcomes, and improved next-release recommendations.', 'evidence', ['slide-loop', 'closed-loop-category-context'], ['loop'], ['operating-loop', 'questions'], 'Complete and audit repeated end-to-end release loops before claiming learning effects.', 'Keep each loop stage labeled LIVE, DEMO, MANUAL, or PLANNED and describe compounding as proposed.'],
  ['closed-loop-company-credibility', 'Can Jovie prove that its own company operating loop is credible?', 'No approved measurements yet show how much autonomous work completes, how often humans intervene, whether verification succeeds, how quickly issues become fixes, or whether changes ship reliably and roll back safely.', 'critical', 'Dated company-operating measurements for autonomy, intervention, verification, latency, cost, reliability, rollback, feedback ingestion, and throughput.', 'evidence', [], ['loop', 'round'], ['operating-loop', 'questions'], 'Instrument the company operating metrics registry and review dated results before making autonomy or execution-efficiency claims.', 'State that company-loop credibility is an instrumentation plan until reviewed measurements exist.'],
] as const satisfies readonly RiskInput[];

// biome-ignore format: One content record per line prevents structural duplication while keeping review diffs readable.
const APPENDIX_DATA = [
  ['narrative-boundary', 'Narrative Boundary', 'The core brief distinguishes verified facts, founder-attested context, thesis, and plans.'],
  ['risk-register', 'Risk Register', 'The questions above map to explicit evidence, strategy, communication, and investor-fit gaps.'],
  ['evidence', 'Evidence Boundary', 'Metrics, terms, market estimates, and customer outcomes remain excluded until their provenance is reviewed.'],
] as const satisfies readonly AppendixInput[];

export const fundraisingRegistry = {
  version: '1.0.0',
  asOf: AS_OF,
  thesis:
    'Jovie is building the operating layer that turns a music release into coordinated, measurable marketing work.',
  companyDefinition:
    'An AI marketing operator for music creators, beginning with release workflows.',
  currentNarrative:
    'Jovie begins with a bounded release-operations workflow: preserve creator and release context, surface executable marketing work, keep approval human-visible, and eventually learn from measured outcomes. The current proof is a product demonstration and founder-attested problem history; paid demand, scalable service economics, and a production closed loop remain evidence gaps.',
  metrics: [
    {
      id: 'customer-revenue-retention',
      label: 'Customer, revenue, activation, and retention metrics',
      value: null,
      status: 'evidence-gap',
      provenance: [],
      lastUpdated: AS_OF,
    },
  ],
  researchSources: [
    source('Demo video asset', '/demo/jovie-demo.mp4', 'first-party-artifact'),
    source('Caption file', '/demo/jovie-demo.vtt', 'first-party-artifact'),
    source(
      'The Friday Problem by Tim White',
      '/blog/the-friday-problem',
      'founder-authored'
    ),
    source(
      'YC Summer 2026 Requests for Startups',
      'https://www.ycombinator.com/rfs',
      'external-context'
    ),
  ],
  investorConversationSummaries: [],
  claims: CLAIM_DATA.map(input =>
    claim(input[0], input[1], input[2], input[3], input[4], input[5])
  ),
  coreSlides: SLIDE_DATA.map(input =>
    slide(input[0], input[1], input[2], input[3])
  ),
  operatingLoop: OPERATING_STEP_DATA.map(input =>
    operatingStep(input[0], input[1], input[2], input[3])
  ),
  founderLetter: [
    'I started Jovie because releasing music repeatedly forced me to rebuild the same small marketing operation. The song had context, but the tools did not. Plans lived in documents, links in separate products, and the next action depended on someone remembering what mattered.',
    'The first version of Jovie is intentionally narrower than the long-term vision. It organizes a release, surfaces the work around it, and gives the artist one place to review what should ship. Some of that experience is live, some is demonstrated, and some execution is still manual. This portal labels those boundaries directly.',
    'The company becomes durable only if it can learn from what was approved, shipped, and effective across releases. The work of this round is to prove that loop with paying creators—not to ask investors to treat the roadmap as traction.',
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
  investorFaq: RISK_DATA.map(input => ({
    riskId: input[0],
    riskLastUpdated: AS_OF,
    question: input[1],
    answer: input[2],
  })),
  companyOperatingMetrics: [
    [
      'autonomous-work-completed',
      'Autonomous work completed',
      'Define a completed autonomous work unit and record completion events.',
    ],
    [
      'intervention-rate',
      'Human intervention rate',
      'Record interventions and divide by attempted autonomous work units.',
    ],
    [
      'verification-success',
      'Verification success rate',
      'Record deterministic verification outcomes for every attempted change.',
    ],
    [
      'issue-to-fix-latency',
      'Issue-to-fix latency',
      'Timestamp issue detection and verified fix completion.',
    ],
    [
      'cost-per-shipped-change',
      'Cost per shipped change',
      'Attribute model, compute, and service cost to each verified shipped change.',
    ],
    [
      'feedback-ingestion-latency',
      'Feedback ingestion latency',
      'Timestamp feedback receipt and durable incorporation into the work queue.',
    ],
    [
      'reliability',
      'Operating-loop reliability',
      'Define successful end-to-end runs and record failures by stage.',
    ],
    [
      'rollback-rate',
      'Rollback rate',
      'Record shipped changes and subsequent rollback events.',
    ],
    [
      'throughput',
      'Verified change throughput',
      'Count verified shipped changes per defined time window.',
    ],
  ].map(([id, label, instrumentationPlan]) => ({
    id,
    label,
    value: null,
    status: 'evidence-gap' as const,
    evidenceGap: `No approved ${label.toLocaleLowerCase('en-US')} measurement is available.`,
    instrumentationPlan,
    lastUpdated: AS_OF,
  })),
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
  const riskIds = new Set(registry.risks.map(risk => risk.id));
  const gapClassifications = new Set<GapClassification>([
    'communication',
    'evidence',
    'strategy',
    'investor-fit',
  ]);
  const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/u.test(value);

  for (const [collection, records] of [
    ['claims', registry.claims],
    ['coreSlides', registry.coreSlides],
    ['risks', registry.risks],
  ] as const) {
    const ids = new Set<string>();
    for (const [index, record] of records.entries()) {
      if (!record.id.trim() || ids.has(record.id)) {
        issues.push({
          path: `${collection}.${index}.id`,
          message: `${collection} IDs must be non-empty and unique.`,
        });
      }
      ids.add(record.id);
    }
  }

  if (!registry.currentNarrative.trim()) {
    issues.push({
      path: 'currentNarrative',
      message: 'The current narrative must not be empty.',
    });
  }

  const metricIds = new Set<string>();
  for (const [index, metric] of registry.metrics.entries()) {
    if (!metric.id.trim() || metricIds.has(metric.id)) {
      issues.push({
        path: `metrics.${index}.id`,
        message: 'Metric IDs must be non-empty and unique.',
      });
    }
    metricIds.add(metric.id);
    if (!metric.label.trim() || !isIsoDate(metric.lastUpdated)) {
      issues.push({
        path: `metrics.${index}`,
        message: 'Metrics require a label and ISO update date.',
      });
    }
    if (
      metric.status === 'evidence-gap' &&
      (metric.value !== null || metric.provenance.length > 0)
    ) {
      issues.push({
        path: `metrics.${index}`,
        message: 'Evidence-gap metrics require a null value and no provenance.',
      });
    }
    if (
      metric.status !== 'evidence-gap' &&
      (!metric.value?.trim() ||
        (metric.status === 'verified' && metric.provenance.length === 0))
    ) {
      issues.push({
        path: `metrics.${index}`,
        message:
          'Available metrics require a value, and verified metrics require provenance.',
      });
    }
    for (const [sourceIndex, metricSource] of metric.provenance.entries()) {
      if (
        !metricSource.label.trim() ||
        !metricSource.href.trim() ||
        !isIsoDate(metricSource.accessedAt)
      ) {
        issues.push({
          path: `metrics.${index}.provenance.${sourceIndex}`,
          message:
            'Metric provenance requires label, href, and ISO access date.',
        });
      }
    }
  }

  for (const [index, researchSource] of registry.researchSources.entries()) {
    if (
      !researchSource.label.trim() ||
      !researchSource.href.trim() ||
      !isIsoDate(researchSource.accessedAt)
    ) {
      issues.push({
        path: `researchSources.${index}`,
        message: 'Research sources require label, href, and ISO access date.',
      });
    }
  }

  const conversationIds = new Set<string>();
  for (const [
    index,
    conversation,
  ] of registry.investorConversationSummaries.entries()) {
    if (
      !/^[a-z0-9][a-z0-9._-]{2,127}$/u.test(conversation.sourceId) ||
      conversationIds.has(conversation.sourceId) ||
      !/^[a-f0-9]{64}$/u.test(conversation.transcriptSha256) ||
      !isIsoDate(conversation.capturedAt) ||
      !conversation.summary.trim()
    ) {
      issues.push({
        path: `investorConversationSummaries.${index}`,
        message:
          'Conversation summaries require a unique immutable source ID, transcript hash, ISO date, and content.',
      });
    }
    conversationIds.add(conversation.sourceId);
  }

  const faqRiskIds = new Set<string>();
  for (const [index, faq] of registry.investorFaq.entries()) {
    const linkedRisk = registry.risks.find(risk => risk.id === faq.riskId);
    if (
      !linkedRisk ||
      !riskIds.has(faq.riskId) ||
      faqRiskIds.has(faq.riskId) ||
      faq.question !== linkedRisk.question ||
      faq.answer !== linkedRisk.answer ||
      faq.riskLastUpdated !== linkedRisk.lastUpdated
    ) {
      issues.push({
        path: `investorFaq.${index}`,
        message:
          'FAQ entries must uniquely match the linked risk question, answer, and version date.',
      });
    }
    faqRiskIds.add(faq.riskId);
  }
  if (faqRiskIds.size !== riskIds.size) {
    issues.push({
      path: 'investorFaq',
      message: 'Every risk requires exactly one FAQ entry.',
    });
  }

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
      if (!isIsoDate(source.accessedAt)) {
        issues.push({
          path: `claims.${index}.provenance.${sourceIndex}.accessedAt`,
          message: 'Provenance requires an ISO access date.',
        });
      }
    }
  }

  for (const [index, risk] of registry.risks.entries()) {
    if (
      !risk.question.trim() ||
      !risk.answer.trim() ||
      !risk.evidenceGap?.trim() ||
      !risk.recommendedCompanyAction.trim() ||
      !risk.recommendedCommunicationAction.trim()
    ) {
      issues.push({
        path: `risks.${index}`,
        message:
          'Risks require question, answer, evidence gap, and company and communication actions.',
      });
    }
    if (!gapClassifications.has(risk.gapClassification)) {
      issues.push({
        path: `risks.${index}.gapClassification`,
        message: 'Risks require a valid gap classification.',
      });
    }
    if (!isIsoDate(risk.lastUpdated)) {
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

  const operatingMetricIds = new Set<string>();
  for (const [index, metric] of registry.companyOperatingMetrics.entries()) {
    if (
      !metric.id.trim() ||
      operatingMetricIds.has(metric.id) ||
      !metric.label.trim() ||
      metric.value !== null ||
      metric.status !== 'evidence-gap' ||
      !metric.evidenceGap.trim() ||
      !metric.instrumentationPlan.trim() ||
      !isIsoDate(metric.lastUpdated)
    ) {
      issues.push({
        path: `companyOperatingMetrics.${index}`,
        message:
          'Company operating metrics require unique IDs, explicit evidence gaps, null values, instrumentation plans, and ISO dates.',
      });
    }
    operatingMetricIds.add(metric.id);
  }

  return issues;
}
