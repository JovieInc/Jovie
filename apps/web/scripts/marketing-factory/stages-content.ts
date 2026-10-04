/**
 * Factory content stages (JOV-7276): truth, outcomes, narrative, then
 * validated layout, hero, proof and gap decisions before copy. Each is a thin
 * adapter over the module that already owns the job.
 */

import { gateCopy, modelFamily, RUBRIC_VERSION } from '@jovie/copy';
import { resolveComposition } from '../../data/marketing/composition';
import {
  HERO_CODE_BINDING_BY_VARIANT,
  selectHeroDecision,
} from '../../data/marketing/factory/heroDecision';
import {
  buildPersuasionPlan,
  persuasionJobToken,
} from '../../data/marketing/factory/persuasionBrief';
import {
  dedupeSectionRequests,
  detectSectionGaps,
} from '../../data/marketing/factory/sectionRequest';
import {
  FACTORY_HERO_VARIANT_IDS,
  type FactoryStage,
  type FactoryStageArtifact,
} from '../../data/marketing/factory/spine';
import { auditMarketingNarrativePlan } from '../../data/marketing/generation';
import { listProductTruthClaims } from '../../data/product-truth/claims';
import {
  createProofPageContext,
  type ProofKind,
  selectProof,
} from '../../data/product-truth/proof';
import { getProductCapability } from '../../data/product-truth/registry';
import {
  allIn,
  artifactOf,
  Checks,
  claimIdsOf,
  judge,
  modelStage,
  result,
  type StageContext,
  type StageResult,
  type StageRunner,
  sectionIdsOf,
} from './stage-kit';

const MATURITY_TO_CLAIM = {
  general_availability: 'shipped',
  public_beta: 'beta',
  limited_testing: 'waitlist',
} as const;

async function truthStage(ctx: StageContext): Promise<StageResult> {
  const checks = new Checks();
  const registry = new Map(listProductTruthClaims().map(c => [c.id, c]));
  const claims: FactoryStageArtifact<'truth'>['claims'] = [];
  for (const id of ctx.brief.claimIds) {
    const claim = registry.get(id);
    if (
      !checks.check(
        `claim-resolves:${id}`,
        Boolean(claim),
        'not in product truth'
      )
    ) {
      continue;
    }
    if (!claim) continue;
    const capability = getProductCapability(claim.capabilityId);
    const maturity =
      capability && capability.maturity !== 'proposed'
        ? MATURITY_TO_CLAIM[capability.maturity]
        : null;
    checks.check(
      `claim-maturity:${id}`,
      maturity !== null,
      'capability is proposed or unknown'
    );
    checks.check(
      `claim-published:${id}`,
      capability?.publication === 'public',
      'capability is not publicly announceable'
    );
    checks.check(
      `offer-truth:${id}`,
      claim.kind !== 'offer' || claim.source === 'offer-truth',
      'offers come only from offer-truth.ts'
    );
    if (!maturity || !capability) continue;
    claims.push({
      id,
      statement: claim.statement,
      maturity,
      evidenceRefs: [
        claim.capabilityId,
        ...capability.evidence.routes,
        ...capability.evidence.captureScenarios,
      ],
    });
  }
  return result(checks, { pageId: ctx.pageId, claims });
}

/**
 * Competitive persuasion brief (JOV-7335): compiles the authored research
 * into the minimum persuasive section plan. Fails on stale or narrow
 * research, a benchmark that skips primitives, an icp/generic taxonomy leak,
 * or a plan that would market a job Jovie cannot truthfully perform.
 */
async function persuasionStage(ctx: StageContext): Promise<StageResult> {
  const checks = new Checks();
  const research = ctx.brief.persuasion;
  const { plan, failures } = buildPersuasionPlan({
    research,
    asOf: ctx.brief.asOf,
  });
  for (const failure of failures) {
    checks.check(failure.id, false, failure.message);
  }
  const known = claimIdsOf(ctx);
  for (const entry of research.benchmark) {
    if (entry.claimIds.length === 0) continue;
    checks.check(
      `persuasion-claims:${entry.primitive}`,
      allIn(entry.claimIds, known).length === 0,
      'persuasion jobs may lean only on truth-stage claim ids'
    );
  }
  checks.check(
    'persuasion-brief',
    failures.length === 0,
    'the competitive persuasion brief must pass before composition'
  );
  return result(
    checks,
    {
      pageId: ctx.pageId,
      researchedAt: research.researchedAt,
      classification: research.classification,
      differentiator: research.differentiator,
      requiredJobs: plan.requiredJobs,
      sectionRequests: plan.sectionRequests,
      proofGaps: plan.proofGaps,
    },
    { notes: { registryGaps: plan.registryGaps } }
  );
}

function outcomesStage(ctx: StageContext): Promise<StageResult> {
  const truth = artifactOf(ctx, 'truth');
  return modelStage(
    ctx,
    'outcomes',
    'narrative-architect',
    'Write {outcomes:[{id,statement,claimIds}], dataPoints:[{statement,sourceRef}]}: at least 3 unique data points, each sourced to a claim id.',
    {
      icp: ctx.brief.icp,
      jobsToBeDone: ctx.brief.jobsToBeDone,
      brief: ctx.brief.brief,
      claims: truth.claims,
    },
    async (value, checks, model) => {
      const known = claimIdsOf(ctx);
      const outcomes = (value.outcomes ?? []) as { claimIds?: string[] }[];
      const dataPoints = (value.dataPoints ?? []) as { sourceRef?: string }[];
      checks.check(
        'outcome-claims-resolve',
        outcomes.every(o => allIn(o.claimIds ?? [], known).length === 0),
        'every outcome maps only to truth-stage claim ids'
      );
      checks.check(
        'data-points-sourced',
        dataPoints.every(point => known.has(point.sourceRef ?? '')),
        'every data point cites a truth-stage claim id'
      );
      const artifact = {
        pageId: ctx.pageId,
        brief: ctx.brief.brief,
        icp: ctx.brief.icp,
        jobsToBeDone: ctx.brief.jobsToBeDone,
        outcomes,
        dataPoints,
      };
      const verdict = await judge(ctx, {
        rubric: 'outcomes',
        tier: 'flagship',
        producerModel: model,
        instruction:
          'Does each outcome follow from the claims and serve the ICP?',
        subject: { claims: truth.claims, outcomes, dataPoints },
      });
      return { artifact, ...verdict };
    }
  );
}

function narrativeStage(ctx: StageContext): Promise<StageResult> {
  const outcomes = artifactOf(ctx, 'outcomes');
  const persuasion = artifactOf(ctx, 'persuasion');
  return modelStage(
    ctx,
    'narrative',
    'narrative-architect',
    'Write {sections:[{sectionInstanceId,sectionId,question,sectionJob,primaryResponsibility,newInformation,customerBelief,evidenceRefs,mustNotRepeat}]}, hero first.',
    {
      outcomes: outcomes.outcomes,
      sectionJobs: ctx.brief.sectionJobs,
      persuasionJobs: persuasion.requiredJobs,
    },
    async (value, checks, model) => {
      const artifact = { pageId: ctx.pageId, sections: value.sections ?? [] };
      const plan = artifact as FactoryStageArtifact<'narrative'>;
      const sections = Array.isArray(plan.sections) ? plan.sections : [];
      const findings = auditMarketingNarrativePlan({ ...plan, sections });
      for (const finding of findings) {
        checks.check(`narrative:${finding.code}`, false, finding.message);
      }
      if (findings.length === 0) checks.check('narrative-audit', true);
      const sectionTokens = new Set(
        sections.flatMap(section => [
          persuasionJobToken(section.sectionId),
          persuasionJobToken(section.sectionJob),
        ])
      );
      checks.check(
        'persuasion-jobs-covered',
        persuasion.requiredJobs.every(
          job =>
            job.routed !== 'section' ||
            sectionTokens.has(persuasionJobToken(job.job))
        ),
        'every section-routed persuasion job needs a narrative section'
      );
      const known = new Set([
        ...claimIdsOf(ctx),
        ...outcomes.outcomes.map(o => o.id),
      ]);
      checks.check(
        'narrative-evidence-resolves',
        sections.every(s => allIn(s.evidenceRefs ?? [], known).length === 0),
        'evidenceRefs must be truth claim ids or outcome ids'
      );
      checks.check(
        'narrative-hero-first',
        sections[0]?.sectionId === 'hero',
        'the first section is the hero'
      );
      const verdict = await judge(ctx, {
        rubric: 'narrative',
        tier: 'flagship',
        producerModel: model,
        instruction:
          'Does every section advance a distinct beat backed by evidence?',
        subject: { outcomes: outcomes.outcomes, sections },
      });
      return { artifact, ...verdict };
    }
  );
}

/**
 * Copy directions written and judged per attempt (JOV-7765). Copy is the
 * stage a visual rejection reworks, so it is where competing directions pay.
 */
export const FACTORY_COPY_DIRECTIONS = 3;

function copyStage(ctx: StageContext): Promise<StageResult> {
  const truth = artifactOf(ctx, 'truth');
  const narrative = artifactOf(ctx, 'narrative');
  const layout = artifactOf(ctx, 'layout');
  const proof = artifactOf(ctx, 'proof');
  const gaps = artifactOf(ctx, 'gap-detection');
  return modelStage(
    ctx,
    'copy',
    'copy-compiler',
    'Write {slots:[{sectionInstanceId,slot,text,claimIds,nonClaim}]}; hero needs headline and subhead slots; tag every claim sentence with claim ids.',
    {
      sections: narrative.sections,
      layout: layout.sections,
      proof,
      sectionRequests: gaps.sectionRequests,
      claims: truth.claims,
    },
    async (value, checks, model) => {
      const slots = (Array.isArray(value.slots) ? value.slots : []) as {
        sectionInstanceId?: string;
        text?: string;
        claimIds?: string[];
      }[];
      const known = claimIdsOf(ctx);
      const sections = sectionIdsOf(ctx);
      checks.check(
        'copy-no-em-dash',
        slots.every(slot => !(slot.text ?? '').includes('—')),
        'em dashes are banned'
      );
      checks.check(
        'copy-claims-resolve',
        slots.every(slot => allIn(slot.claimIds ?? [], known).length === 0),
        'slots may cite only truth-stage claim ids'
      );
      checks.check(
        'copy-sections-resolve',
        slots.every(slot => sections.has(slot.sectionInstanceId ?? '')),
        'every slot belongs to a narrative section'
      );
      const gate = await gateCopy(
        slots.map(slot => slot.text ?? '').join('\n'),
        {
          register: 'jovie-marketing',
          tier: 'flagship',
          audience: ctx.brief.icp,
          goal: ctx.brief.brief.businessObjective,
          facts: truth.claims.map(claim => claim.statement),
          generatorModel: model,
        },
        ctx.providers.transport ?? undefined
      );
      checks.check('copy-lint', gate.lint.ok, 'deterministic copy lint failed');
      if (gate.status !== 'blocked' || !gate.lint.ok) {
        checks.check(
          'copy-gate',
          gate.status === 'pass',
          'judge panel asked for a revision'
        );
      }
      return {
        artifact: { pageId: ctx.pageId, slots },
        critique: [...gate.critique],
        unavailable:
          gate.status === 'blocked' && gate.lint.ok
            ? (gate.critique[0] ?? 'copy judge panel unavailable')
            : null,
        evaluators: gate.verdicts.map(verdict => ({
          id: ctx.providers.label(verdict.model),
          family: modelFamily(verdict.model),
          kind: 'llm' as const,
          verdict: verdict.pass ? ('pass' as const) : ('revise' as const),
          // Judges score 1-10; clamp so an out-of-range reply cannot break the receipt schema.
          score: Math.min(
            1,
            Math.max(0, Math.min(...Object.values(verdict.scores)) / 10)
          ),
          rubricVersion: RUBRIC_VERSION,
        })),
      };
    },
    { directions: FACTORY_COPY_DIRECTIONS }
  );
}

async function layoutStage(ctx: StageContext): Promise<StageResult> {
  const checks = new Checks();
  const persuasion = artifactOf(ctx, 'persuasion');
  const narrative = artifactOf(ctx, 'narrative');
  const hero = narrative.sections.find(section => section.sectionId === 'hero');
  const heroDecision = selectHeroDecision(ctx.brief.hero);
  const heroVariant =
    HERO_CODE_BINDING_BY_VARIANT[heroDecision.variant].sectionVariantId;
  checks.check(
    'hero-code-binding',
    Boolean(hero && heroVariant),
    'the chosen hero needs a canonical code binding before copy'
  );
  const explicitHero =
    hero && ctx.brief.sectionVariants?.[hero.sectionInstanceId];
  checks.check(
    'hero-layout-consistent',
    !explicitHero || explicitHero === heroVariant,
    'the narrative hero variant conflicts with the locked hero decision'
  );
  const composition = resolveComposition(ctx.brief.brief, {
    sectionJobs: ctx.brief.sectionJobs,
    existingSectionRequests: persuasion.sectionRequests,
    narrativePlan: narrative,
    sectionVariants: {
      ...ctx.brief.sectionVariants,
      ...(hero && heroVariant ? { [hero.sectionInstanceId]: heroVariant } : {}),
    },
  });
  checks.check(
    'composition-has-hero',
    composition.sections.some(section => section.sectionId === 'hero'),
    'the resolver dropped the hero'
  );
  checks.check(
    'composition-essential-jobs',
    !composition.shadowRequired,
    'an essential story job has no certified section; resolve its section request before copy'
  );
  return result(checks, composition, {
    notes: { shadowRequired: composition.shadowRequired ?? false },
  });
}

async function heroStage(ctx: StageContext): Promise<StageResult> {
  const checks = new Checks();
  const contract = selectHeroDecision(ctx.brief.hero);
  checks.check(
    'hero-locked-variant',
    (FACTORY_HERO_VARIANT_IDS as readonly string[]).includes(contract.penId),
    `${contract.variant} is not a selectable locked N8WMP variant`
  );
  // Docked is the resting state; the renderer flips to scrolled on scroll.
  return result(
    checks,
    {
      pageId: ctx.pageId,
      variantId: contract.penId,
      headerId: 'eoUUU',
      headerState: 'docked',
    },
    { notes: { variant: contract.variant } }
  );
}

const SPINE_PROOF_KIND: Readonly<
  Record<
    ProofKind,
    FactoryStageArtifact<'proof'>['items'][number]['kind'] | null
  >
> = {
  logo: 'logo',
  quote: 'quote',
  metric: 'metric',
  'product-proof': 'product',
  'third-party': null,
};

async function proofStage(ctx: StageContext): Promise<StageResult> {
  const checks = new Checks();
  const page = createProofPageContext(ctx.pageId, ctx.brief.asOf);
  const known = claimIdsOf(ctx);
  const sections = sectionIdsOf(ctx);
  const narrative = artifactOf(ctx, 'narrative').sections;
  const artifact: FactoryStageArtifact<'proof'> = {
    pageId: ctx.pageId,
    items: [],
    requests: [],
  };
  const proofRequests: unknown[] = [];
  for (const need of ctx.brief.proof) {
    checks.check(
      `proof-claim:${need.claimId}`,
      known.has(need.claimId),
      'proof must support a truth-stage claim'
    );
    checks.check(
      `proof-section:${need.sectionInstanceId}`,
      sections.has(need.sectionInstanceId),
      'proof must sit in a narrative section'
    );
    // Registry proof is scoped by canonical section id, not by instance.
    const sectionId = narrative.find(
      section => section.sectionInstanceId === need.sectionInstanceId
    )?.sectionId;
    const selected = selectProof({
      id: sectionId ?? need.sectionInstanceId,
      claimId: need.claimId,
      page,
      kind: need.kind,
      fallbackKinds: need.fallbackKinds,
      audience: ctx.brief.brief.targetAudience,
    });
    const kind = SPINE_PROOF_KIND[selected.kind];
    if (
      !checks.check(
        `proof-kind:${selected.kind}`,
        kind !== null,
        'no spine proof slot for this kind'
      )
    ) {
      continue;
    }
    if (!kind) continue;
    if (selected.recordType === 'proof-request') {
      proofRequests.push(selected);
      artifact.requests.push({
        sectionInstanceId: need.sectionInstanceId,
        kind,
        reason: `${selected.suggestedLane}: no valid ${selected.kind} proof for ${selected.claimId}`,
      });
    } else {
      artifact.items.push({
        sectionInstanceId: need.sectionInstanceId,
        kind,
        registryId: selected.id,
        claimId: selected.claimId,
      });
    }
  }
  if (artifact.items.length === 0) {
    return result(checks, artifact, { notes: { proofRequests } });
  }
  const verdict = await judge(ctx, {
    rubric: 'proof-red-team',
    tier: 'standard',
    producerModel: undefined,
    instruction: 'Does each proof item actually support its claim?',
    subject: { claims: artifactOf(ctx, 'truth').claims, items: artifact.items },
  });
  return result(checks, artifact, {
    evaluators: verdict.evaluators,
    feedback: [...checks.feedback, ...verdict.critique],
    unavailable: verdict.unavailable,
    notes: { proofRequests },
  });
}

async function gapStage(ctx: StageContext): Promise<StageResult> {
  const checks = new Checks();
  const persuasion = artifactOf(ctx, 'persuasion');
  const report = detectSectionGaps(ctx.brief.sectionJobs);
  const sectionRequests = dedupeSectionRequests([
    ...report.requests,
    ...persuasion.sectionRequests,
  ]);
  checks.check('gap-report', true);
  checks.check(
    'no-essential-section-gaps',
    !sectionRequests.some(request => request.essential),
    'essential section requests must be resolved before copy'
  );
  return result(
    checks,
    { pageId: ctx.pageId, sectionRequests },
    {
      notes: {
        registryGaps: report.registryGaps,
        shadowRequired: sectionRequests.some(request => request.essential),
      },
    }
  );
}

export const CONTENT_STAGE_RUNNERS = {
  truth: truthStage,
  persuasion: persuasionStage,
  outcomes: outcomesStage,
  narrative: narrativeStage,
  copy: copyStage,
  layout: layoutStage,
  'hero-variant': heroStage,
  proof: proofStage,
  'gap-detection': gapStage,
} as const satisfies Partial<Record<FactoryStage, StageRunner>>;
