import 'server-only';

import { APP_ROUTES } from '@/constants/routes';
import {
  type FounderFunnelData,
  getFounderFunnelData,
} from '@/lib/admin/founder-funnel';
import {
  getAuthSignupOnboardingCanaryStatus,
  getPublicProfileCanaryStatus,
} from '@/lib/admin/ops-queries';
import {
  type M2RevenuePathReceipt,
  type M2RevenuePathStepName,
  runM2RevenuePathCanary,
} from '@/lib/canaries/m2-revenue-path';
import type { CanaryReport } from '@/lib/canaries/public-profile';
import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import { resolveHudGithubToken } from '@/lib/github/hud-token.server';
import { serverFetch } from '@/lib/http/server-fetch';
import { getRedis } from '@/lib/redis';
import { logger } from '@/lib/utils/logger';
import {
  COMMERCE_DECISION_PROJECTION_CONTRACT,
  type CommerceDecisionProjection,
  type CommerceEvidenceKind,
  projectCommerceDecisions,
} from './commerce-decision';
import {
  ACQUISITION_ELIGIBILITY_CONTRACT,
  type AcquisitionEligibility,
  type ConeEvidence,
  type ConeRequirementId,
  evaluateAcquisitionEligibility,
  unknownAcquisitionEligibility,
} from './eligibility';

const PRODUCTION_BASE_URL = 'https://jov.ie';
const HOUR_MS = 60 * 60_000;
const LIVE_MAX_AGE_MS = 15 * 60_000;
const DAILY_CANARY_MAX_AGE_MS = 30 * HOUR_MS;
const DAILY_WORKFLOW_MAX_AGE_MS = 48 * HOUR_MS;
const CACHE_KEY = 'acquisition:eligibility:v1';
const CACHE_TTL_SECONDS = 10 * 60;

/** Workflows whose latest completed main run is cone evidence. */
export const CONE_WORKFLOWS = {
  /** Includes the canonical artist profile certificate (JOV-6920). */
  revenuePath: 'm2-revenue-path-canary.yml',
  /**
   * signup → claim → checkout → verified payment → entitlement → refund: the
   * Golden Path job of the latest dispatched main ci.yml run. The nightly
   * workflow only dispatches it, so its own run proves nothing.
   */
  goldenPath: 'ci.yml#Golden Path (manual)',
} as const;

const M2_STEP_REQUIREMENTS: Record<M2RevenuePathStepName, ConeRequirementId> = {
  signed_out: 'entry',
  claim: 'claim',
  pro_checkout_199: 'offer_checkout',
  activation: 'activation',
};

export interface WorkflowRunReceipt {
  readonly conclusion: string | null;
  readonly createdAt: string;
  readonly url: string | null;
  readonly headSha: string | null;
}

export type WorkflowRunRead =
  | { readonly status: 'observed'; readonly run: WorkflowRunReceipt | null }
  | { readonly status: 'unavailable'; readonly reason: string };

export interface FunnelSnapshot {
  readonly definitionVersion: string;
  readonly timeRange: string;
  readonly biggestDropOffKey: string | null;
  readonly stages: readonly {
    readonly key: string;
    readonly count: number;
    readonly conversionRate: number | null;
    readonly dropOff: number | null;
  }[];
  readonly errors: readonly string[];
}

export interface AcquisitionEligibilityReport extends AcquisitionEligibility {
  /** Current funnel counts/dropoffs, so planners diagnose before adding traffic. */
  readonly funnel: FunnelSnapshot | null;
  /** Redacted commerce matrix, selected rail evidence and canary state. */
  readonly commerce: CommerceDecisionProjection;
}

export interface AcquisitionEligibilityDeps {
  readonly now: () => Date;
  readonly runRevenuePathCanary: () => Promise<M2RevenuePathReceipt>;
  readonly readAuthSignupCanary: () => Promise<CanaryReport | null>;
  readonly readPublicProfileCanary: () => Promise<CanaryReport | null>;
  readonly readWorkflowRun: (workflowFile: string) => Promise<WorkflowRunRead>;
  readonly readFunnel: () => Promise<FounderFunnelData>;
  /** Existing matrix/decision owner; absent or malformed evidence fails closed. */
  readonly readCommerceDecision: () => Promise<unknown>;
}

/**
 * Conclusion of the named job in a run. A job that never ran, or was skipped
 * because an upstream job failed, counts as the run failing.
 */
export function jobConclusion(
  jobs: ReadonlyArray<Record<string, unknown>>,
  jobName: string,
  runConclusion: string | null
): string | null {
  const job = jobs.find(item => item.name === jobName);
  const conclusion =
    typeof job?.conclusion === 'string' ? job.conclusion : null;
  if (conclusion && conclusion !== 'skipped') return conclusion;
  return runConclusion === 'cancelled' ? 'cancelled' : 'failure';
}

async function readLatestMainWorkflowRun(
  workflowSpec: string
): Promise<WorkflowRunRead> {
  const owner = env.HUD_GITHUB_OWNER;
  const repo = env.HUD_GITHUB_REPO;
  const token = await resolveHudGithubToken();
  if (!token || !owner || !repo) {
    return { status: 'unavailable', reason: 'GitHub read is not configured.' };
  }
  // `file#Job name` reads one job of the latest dispatched main run.
  const [workflowFile, jobName] = workflowSpec.split('#', 2);
  const repoUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const event = jobName ? '&event=workflow_dispatch' : '';
  const readJson = async (url: string) => {
    const response = await serverFetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      cache: 'no-store',
      context: 'Acquisition eligibility workflow run',
      timeoutMs: 8000,
    });
    return response.ok
      ? { ok: true as const, payload: await response.json() }
      : { ok: false as const, status: response.status };
  };
  const runs = await readJson(
    `${repoUrl}/actions/workflows/${encodeURIComponent(workflowFile)}/runs?branch=main&status=completed${event}&per_page=1`
  );
  if (!runs.ok) {
    return {
      status: 'unavailable',
      reason: `GitHub API error (${runs.status}).`,
    };
  }
  const payload = runs.payload as {
    workflow_runs?: Array<Record<string, unknown>>;
  };
  const run = payload.workflow_runs?.[0];
  if (!run || typeof run.created_at !== 'string') {
    return { status: 'observed', run: null };
  }
  let conclusion = typeof run.conclusion === 'string' ? run.conclusion : null;
  if (jobName) {
    const jobs = await readJson(
      `${repoUrl}/actions/runs/${encodeURIComponent(String(run.id))}/jobs?filter=latest&per_page=100`
    );
    if (!jobs.ok) {
      return {
        status: 'unavailable',
        reason: `GitHub API error (${jobs.status}).`,
      };
    }
    const list = (jobs.payload as { jobs?: Array<Record<string, unknown>> })
      .jobs;
    conclusion = jobConclusion(list ?? [], jobName, conclusion);
  }
  return {
    status: 'observed',
    run: {
      conclusion,
      createdAt: run.created_at,
      headSha: typeof run.head_sha === 'string' ? run.head_sha : null,
      url: typeof run.html_url === 'string' ? run.html_url : null,
    },
  };
}

export const defaultAcquisitionEligibilityDeps: AcquisitionEligibilityDeps = {
  now: () => new Date(),
  runRevenuePathCanary: () =>
    runM2RevenuePathCanary({ baseUrl: PRODUCTION_BASE_URL }),
  readAuthSignupCanary: getAuthSignupOnboardingCanaryStatus,
  readPublicProfileCanary: getPublicProfileCanaryStatus,
  readWorkflowRun: readLatestMainWorkflowRun,
  readFunnel: () => getFounderFunnelData('30d'),
  // JOV-8214/JOV-8215 own the upstream receipt. Until it exists, expose the
  // known offer/candidate rail but keep every commerce gate UNKNOWN.
  readCommerceDecision: async () => null,
};

function errorDetail(_error: unknown): string {
  // Upstream exceptions can embed bearer tokens, provider/customer ids,
  // payment references or PII. The surrounding evidence source already says
  // which read failed, so the projection deliberately exposes no raw message.
  return 'upstream error';
}

async function revenuePathEvidence(
  deps: AcquisitionEligibilityDeps
): Promise<ConeEvidence[]> {
  try {
    const receipt = await deps.runRevenuePathCanary();
    return (Object.keys(M2_STEP_REQUIREMENTS) as M2RevenuePathStepName[]).map(
      name => {
        const step = receipt.steps.find(item => item.name === name);
        const base = {
          maxAgeMs: LIVE_MAX_AGE_MS,
          ref: null,
          requirement: M2_STEP_REQUIREMENTS[name],
          source: `m2-revenue-path:live#${name}`,
        };
        if (!step) {
          return {
            ...base,
            detail: 'The canary did not run this step.',
            observedAt: null,
            status: 'unknown' as const,
          };
        }
        return {
          ...base,
          detail: step.ok ? 'Step passed.' : 'Step failed.',
          observedAt: step.finishedAt,
          status: step.ok ? ('green' as const) : ('red' as const),
        };
      }
    );
  } catch (error) {
    return Object.entries(M2_STEP_REQUIREMENTS).map(([name, requirement]) => ({
      detail: `Live revenue-path probe could not run: ${errorDetail(error)}`,
      maxAgeMs: LIVE_MAX_AGE_MS,
      observedAt: null,
      ref: null,
      requirement,
      source: `m2-revenue-path:live#${name}`,
      status: 'unknown' as const,
    }));
  }
}

async function canaryEvidence(
  requirement: ConeRequirementId,
  source: string,
  read: () => Promise<CanaryReport | null>
): Promise<ConeEvidence> {
  const base = {
    maxAgeMs: DAILY_CANARY_MAX_AGE_MS,
    ref: null,
    requirement,
    source,
  };
  try {
    const report = await read();
    if (!report) {
      return {
        ...base,
        detail: 'No canary run is recorded in the last 26 hours.',
        observedAt: null,
        status: 'unknown',
      };
    }
    const failed = report.checks.filter(check => !check.ok);
    return {
      ...base,
      detail: report.pass
        ? `${report.checks.length} checks passed.`
        : `${failed.length} of ${report.checks.length} checks failed.`,
      observedAt: report.runAt,
      status: report.pass ? 'green' : 'red',
    };
  } catch (error) {
    return {
      ...base,
      detail: `Canary status could not be read: ${errorDetail(error)}`,
      observedAt: null,
      status: 'unknown',
    };
  }
}

async function workflowEvidence(
  requirement: ConeRequirementId,
  workflowFile: string,
  deps: AcquisitionEligibilityDeps
): Promise<ConeEvidence> {
  const base = {
    maxAgeMs: DAILY_WORKFLOW_MAX_AGE_MS,
    requirement,
    source: `github:${workflowFile}@main`,
  };
  try {
    const read = await deps.readWorkflowRun(workflowFile);
    if (read.status === 'unavailable') {
      return {
        ...base,
        detail: read.reason,
        observedAt: null,
        ref: null,
        status: 'unknown',
      };
    }
    if (!read.run) {
      return {
        ...base,
        detail: 'No completed main run exists.',
        observedAt: null,
        ref: null,
        status: 'unknown',
      };
    }
    const { conclusion } = read.run;
    let status: ConeEvidence['status'] = 'unknown';
    if (conclusion === 'success') status = 'green';
    else if (conclusion === 'failure' || conclusion === 'timed_out') {
      status = 'red';
    }
    return {
      ...base,
      detail: `Latest completed main run concluded ${conclusion ?? 'without a conclusion'}.`,
      observedAt: read.run.createdAt,
      ref: null,
      status,
    };
  } catch (error) {
    return {
      ...base,
      detail: `Workflow run could not be read: ${errorDetail(error)}`,
      observedAt: null,
      ref: null,
      status: 'unknown',
    };
  }
}

async function funnelEvidence(
  deps: AcquisitionEligibilityDeps
): Promise<{ evidence: ConeEvidence; funnel: FunnelSnapshot | null }> {
  const base = {
    maxAgeMs: LIVE_MAX_AGE_MS,
    ref: APP_ROUTES.ADMIN_GROWTH,
    requirement: 'instrumentation' as const,
    source: 'founder-funnel:30d',
  };
  try {
    const data = await deps.readFunnel();
    const funnel: FunnelSnapshot = {
      biggestDropOffKey: data.biggestDropOffKey,
      definitionVersion: data.definitionVersion,
      errors: data.errors.length > 0 ? ['Funnel source reported errors.'] : [],
      stages: data.stages.map(stage => ({
        conversionRate: stage.conversionRate,
        count: stage.count,
        dropOff: stage.dropOff,
        key: stage.key,
      })),
      timeRange: data.timeRange,
    };
    const healthy = data.errors.length === 0 && data.stages.length > 0;
    return {
      evidence: {
        ...base,
        detail: healthy
          ? `${data.definitionVersion}: ${data.stages.length} stages, internal and test accounts excluded.`
          : `Funnel read degraded: ${data.errors.length} source error(s), ${data.stages.length} stage(s).`,
        observedAt: deps.now().toISOString(),
        status: healthy ? 'green' : 'unknown',
      },
      funnel,
    };
  } catch (error) {
    return {
      evidence: {
        ...base,
        detail: `Funnel could not be read: ${errorDetail(error)}`,
        observedAt: null,
        status: 'unknown',
      },
      funnel: null,
    };
  }
}

const COMMERCE_REQUIREMENTS: Record<CommerceEvidenceKind, ConeRequirementId> = {
  'selected-rail': 'selected_rail',
  'jov-6258-preflight': 'jov6258_preflight',
  'handoff-correlation': 'handoff_correlation',
  'payment-journey': 'payment_journey',
  reversal: 'reversal',
};

async function commerceDecisionEvidence(
  deps: AcquisitionEligibilityDeps,
  now: Date
): Promise<{
  projection: CommerceDecisionProjection;
  evidence: readonly ConeEvidence[];
}> {
  let source: unknown = null;
  try {
    source = await deps.readCommerceDecision();
  } catch {
    // Reader errors are not reflected because they may contain credentials or
    // provider identifiers. The redacted fallback says only that evidence is
    // unavailable and keeps every gate closed.
  }
  const projection = projectCommerceDecisions(source, now);
  const decision = projection.matrix.find(
    item => item.offer === projection.acquisitionOffer
  );
  const evidence = Object.entries(COMMERCE_REQUIREMENTS).map(
    ([kind, requirement]) => {
      const item = decision?.evidence.find(entry => entry.kind === kind);
      let status = item?.status ?? 'unknown';
      if (kind === 'selected-rail') {
        if (
          decision?.accessState === 'partner-gated' ||
          decision?.accessState === 'unsupported'
        ) {
          status = 'red';
        } else if (decision?.accessState !== 'supported' || !decision.rail) {
          status = 'unknown';
        }
      }
      return {
        requirement,
        source: `commerce-decision:${kind}`,
        status,
        observedAt: item?.observedAt ?? null,
        maxAgeMs: item?.freshnessBudgetMs ?? DAILY_WORKFLOW_MAX_AGE_MS,
        ref: null,
        detail:
          status === 'green'
            ? 'Current redacted commerce evidence is present.'
            : 'Required redacted commerce evidence is not currently green.',
      } satisfies ConeEvidence;
    }
  );
  const canaryStatus: ConeEvidence['status'] =
    decision?.canary.result === 'passed'
      ? 'green'
      : decision?.canary.result === 'failed'
        ? 'red'
        : 'unknown';
  return {
    projection,
    evidence: [
      ...evidence,
      {
        requirement: 'commerce_canary',
        source: 'commerce-decision:canary',
        status: canaryStatus,
        observedAt: decision?.canary.observedAt ?? null,
        maxAgeMs:
          decision?.canary.freshnessBudgetMs ?? DAILY_WORKFLOW_MAX_AGE_MS,
        ref: null,
        detail:
          canaryStatus === 'green'
            ? 'The bounded commerce canary passed with current evidence.'
            : 'The bounded commerce canary has not produced a current pass.',
      },
    ],
  };
}

/** Compose current cone evidence into ACQUISITION_ELIGIBLE. Never throws. */
export async function computeAcquisitionEligibility(
  deps: AcquisitionEligibilityDeps = defaultAcquisitionEligibilityDeps
): Promise<AcquisitionEligibilityReport> {
  try {
    const now = deps.now();
    const [m2, auth, profile, m2Workflow, goldenPath, funnel, commerce] =
      await Promise.all([
        revenuePathEvidence(deps),
        canaryEvidence(
          'auth_signup',
          'canary:auth-signup-onboarding',
          deps.readAuthSignupCanary
        ),
        canaryEvidence(
          'profile_truth',
          'canary:public-profile',
          deps.readPublicProfileCanary
        ),
        workflowEvidence('profile_truth', CONE_WORKFLOWS.revenuePath, deps),
        workflowEvidence(
          'payment_entitlement',
          CONE_WORKFLOWS.goldenPath,
          deps
        ),
        funnelEvidence(deps),
        commerceDecisionEvidence(deps, now),
      ]);
    return {
      ...evaluateAcquisitionEligibility({
        evidence: [
          ...m2,
          auth,
          profile,
          m2Workflow,
          goldenPath,
          funnel.evidence,
          ...commerce.evidence,
        ],
        now,
      }),
      funnel: funnel.funnel,
      commerce: commerce.projection,
    };
  } catch (error) {
    const now = deps.now();
    return {
      ...unknownAcquisitionEligibility(
        now,
        `Cone evidence could not be composed: ${errorDetail(error)}`
      ),
      funnel: null,
      commerce: projectCommerceDecisions(null, now),
    };
  }
}

function isCachedReport(value: unknown): value is AcquisitionEligibilityReport {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { contract?: unknown }).contract ===
      ACQUISITION_ELIGIBILITY_CONTRACT &&
    typeof (value as { eligible?: unknown }).eligible === 'boolean' &&
    (value as { commerce?: { contract?: unknown } }).commerce?.contract ===
      COMMERCE_DECISION_PROJECTION_CONTRACT
  );
}

/**
 * Cached read for planners and dispatchers. The cache only bounds probe cost;
 * a cache miss or Redis failure recomputes from live evidence, and nothing
 * here can mark the cone eligible without current receipts.
 */
export async function getAcquisitionEligibility(
  options: { readonly fresh?: boolean } = {},
  deps: AcquisitionEligibilityDeps = defaultAcquisitionEligibilityDeps
): Promise<AcquisitionEligibilityReport> {
  const redis = getRedis();
  if (redis && !options.fresh) {
    try {
      const cached = await redis.get<unknown>(CACHE_KEY);
      const parsed = typeof cached === 'string' ? JSON.parse(cached) : cached;
      if (isCachedReport(parsed)) return parsed;
    } catch (error) {
      logger.warn('[acquisition/eligibility] cache read failed', error);
    }
  }

  const report = await computeAcquisitionEligibility(deps);
  if (redis) {
    try {
      await redis.set(CACHE_KEY, JSON.stringify(report), {
        ex: CACHE_TTL_SECONDS,
      });
    } catch (error) {
      await captureError('Acquisition eligibility cache write failed', error, {
        context: 'acquisition-eligibility',
      });
    }
  }
  return report;
}
