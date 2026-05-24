import 'server-only';

import { env } from '@/lib/env-server';
import { getHermesDispatchAvailability } from '@/lib/hermes/dispatch';
import { serverFetch } from '@/lib/http/server-fetch';
import type {
  HermesAiOpsCounts,
  HermesAiOpsItem,
  HermesAiOpsSourceStatus,
  HermesAiOpsStatus,
  HermesAiOpsSummary,
} from '@/types/ai-ops';

const AGENT_PR_THRESHOLD = 10;
const HERMES_WORKER_WORKFLOW = 'hermes-cli-worker.yml';
const STALE_RUN_MS = 2 * 60 * 60 * 1000;
const STALE_PR_MS = 48 * 60 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed)
      ? new Date().toISOString()
      : new Date(parsed).toISOString();
  }
  return new Date().toISOString();
}

function emptyCounts(): HermesAiOpsCounts {
  return {
    queued: 0,
    running: 0,
    blocked: 0,
    review: 0,
    done: 0,
    failed: 0,
    stale: 0,
  };
}

function countStatuses(items: readonly HermesAiOpsItem[]): HermesAiOpsCounts {
  const counts: Record<HermesAiOpsStatus, number> = { ...emptyCounts() };
  for (const item of items) {
    counts[item.status] += 1;
  }
  return counts;
}

function isAgentBranch(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return (
    /^(codex|claude|codegen-bot|linear)\//.test(value) ||
    /(^|\/)jov-[0-9]+/i.test(value)
  );
}

function hasBlockingLabel(labels: unknown): boolean {
  if (!Array.isArray(labels)) return false;
  return labels.some(label => {
    if (!isRecord(label)) return false;
    const name = typeof label.name === 'string' ? label.name : '';
    return name === 'needs-human' || name === 'human-review-required';
  });
}

function formatWorkflowStatus(
  status: unknown,
  conclusion: unknown,
  createdAtIso: string,
  now: Date
): HermesAiOpsStatus {
  const statusText = String(status);
  const conclusionText = String(conclusion);
  const ageMs = now.getTime() - Date.parse(createdAtIso);

  if (Number.isFinite(ageMs) && ageMs > STALE_RUN_MS) {
    if (statusText === 'queued' || statusText === 'in_progress') return 'stale';
  }
  if (statusText === 'queued') return 'queued';
  if (statusText === 'in_progress') return 'running';
  if (statusText === 'completed') {
    if (conclusionText === 'success') return 'done';
    if (
      conclusionText === 'failure' ||
      conclusionText === 'cancelled' ||
      conclusionText === 'timed_out'
    ) {
      return 'failed';
    }
  }

  return 'running';
}

function formatPrStatus(
  pr: Record<string, unknown>,
  now: Date
): HermesAiOpsStatus {
  const updatedAtIso = normalizeIso(pr.updated_at);
  const ageMs = now.getTime() - Date.parse(updatedAtIso);

  if (Number.isFinite(ageMs) && ageMs > STALE_PR_MS) return 'stale';
  if (hasBlockingLabel(pr.labels)) return 'blocked';
  if (pr.draft === true) return 'running';
  return 'review';
}

async function fetchGitHubJson(
  path: string,
  context: string
): Promise<
  | { ok: true; payload: unknown }
  | { ok: false; errorMessage: string; status?: number }
> {
  const token = env.HUD_GITHUB_TOKEN;
  const owner = env.HUD_GITHUB_OWNER;
  const repo = env.HUD_GITHUB_REPO;

  if (!token || !owner || !repo) {
    return { ok: false, errorMessage: 'GitHub HUD source not configured.' };
  }

  try {
    const response = await serverFetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${path}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
        cache: 'no-store',
        context,
        retry: {
          maxRetries: 1,
          baseDelayMs: 500,
        },
      }
    );

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        errorMessage: `GitHub API error (${response.status})`,
      };
    }

    return { ok: true, payload: await response.json() };
  } catch (error) {
    return {
      ok: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

function normalizePrItems(payload: unknown, now: Date): HermesAiOpsItem[] {
  const prs = Array.isArray(payload) ? payload : [];

  return prs
    .map((pr): HermesAiOpsItem | null => {
      if (!isRecord(pr) || !isRecord(pr.head)) return null;
      if (!isAgentBranch(pr.head.ref)) return null;

      const number = typeof pr.number === 'number' ? pr.number : null;
      const title = typeof pr.title === 'string' ? pr.title : 'Agent PR';
      const url = typeof pr.html_url === 'string' ? pr.html_url : null;
      const user =
        isRecord(pr.user) && typeof pr.user.login === 'string'
          ? pr.user.login
          : null;

      return {
        source: 'github',
        kind: 'pr',
        status: formatPrStatus(pr, now),
        priority: hasBlockingLabel(pr.labels) ? 90 : 60,
        url,
        owner: user,
        summary: number == null ? title : `#${number} ${title}`,
        updatedAt: normalizeIso(pr.updated_at),
      };
    })
    .filter((item): item is HermesAiOpsItem => item !== null);
}

function normalizeWorkflowRuns(payload: unknown, now: Date): HermesAiOpsItem[] {
  if (!isRecord(payload) || !Array.isArray(payload.workflow_runs)) return [];

  return payload.workflow_runs
    .map((run): HermesAiOpsItem | null => {
      if (!isRecord(run)) return null;
      const id = typeof run.id === 'number' ? run.id : null;
      if (id == null) return null;

      const branch =
        typeof run.head_branch === 'string' ? run.head_branch : null;
      const actor =
        isRecord(run.actor) && typeof run.actor.login === 'string'
          ? run.actor.login
          : null;
      const status = formatWorkflowStatus(
        run.status,
        run.conclusion,
        normalizeIso(run.created_at),
        now
      );

      return {
        source: 'ci',
        kind: 'workflow',
        status,
        priority: status === 'failed' || status === 'stale' ? 85 : 50,
        url: typeof run.html_url === 'string' ? run.html_url : null,
        owner: actor,
        summary: branch
          ? `Hermes CLI worker on ${branch}`
          : `Hermes CLI worker run ${id}`,
        updatedAt: normalizeIso(run.updated_at ?? run.created_at),
      };
    })
    .filter((item): item is HermesAiOpsItem => item !== null);
}

function sourceStatus(
  configured: boolean,
  itemCount: number,
  errorMessage?: string
): HermesAiOpsSourceStatus {
  return {
    availability: !configured
      ? 'not_configured'
      : errorMessage
        ? 'error'
        : 'available',
    configured,
    itemCount,
    ...(errorMessage ? { errorMessage } : {}),
  };
}

function buildRecommendations(params: {
  blockers: readonly HermesAiOpsItem[];
  dispatchAvailable: boolean;
  dispatchUnavailableReason: string | null;
  mergePressure: 'normal' | 'elevated' | 'high';
  runningCount: number;
  generatedAtIso: string;
}): HermesAiOpsItem[] {
  const recommendations: HermesAiOpsItem[] = [];

  if (!params.dispatchAvailable) {
    recommendations.push({
      source: 'hermes',
      kind: 'recommendation',
      status: 'blocked',
      priority: 100,
      url: null,
      owner: 'Hermes',
      summary:
        params.dispatchUnavailableReason ??
        'Configure GitHub dispatch credentials before launching workers.',
      updatedAt: params.generatedAtIso,
    });
  }

  if (params.blockers.length > 0) {
    recommendations.push({
      source: 'hermes',
      kind: 'recommendation',
      status: 'blocked',
      priority: 90,
      url: params.blockers[0]?.url ?? null,
      owner: 'Hermes',
      summary: `Clear ${params.blockers.length} blocked or failed automation item${params.blockers.length === 1 ? '' : 's'} before increasing worker volume.`,
      updatedAt: params.generatedAtIso,
    });
  }

  if (params.mergePressure !== 'normal') {
    recommendations.push({
      source: 'hermes',
      kind: 'recommendation',
      status: 'review',
      priority: params.mergePressure === 'high' ? 95 : 75,
      url: null,
      owner: 'Hermes',
      summary:
        params.mergePressure === 'high'
          ? 'Merge queue pressure is high; review or land agent PRs before dispatching more.'
          : 'Merge queue pressure is elevated; prefer review work over new worker starts.',
      updatedAt: params.generatedAtIso,
    });
  }

  if (
    params.dispatchAvailable &&
    params.blockers.length === 0 &&
    params.runningCount === 0
  ) {
    recommendations.push({
      source: 'hermes',
      kind: 'recommendation',
      status: 'queued',
      priority: 50,
      url: null,
      owner: 'Hermes',
      summary:
        'Dispatch one focused Codex or Claude worker from HUD when a scoped issue is ready.',
      updatedAt: params.generatedAtIso,
    });
  }

  return recommendations;
}

export async function getHudAiOpsSummary(
  now = new Date()
): Promise<HermesAiOpsSummary> {
  const generatedAtIso = now.toISOString();
  const dispatch = getHermesDispatchAvailability();
  const githubConfigured = Boolean(
    env.HUD_GITHUB_TOKEN && env.HUD_GITHUB_OWNER && env.HUD_GITHUB_REPO
  );

  if (!githubConfigured) {
    const blockers: HermesAiOpsItem[] = [];
    const recommendations = buildRecommendations({
      blockers,
      dispatchAvailable: dispatch.available,
      dispatchUnavailableReason: dispatch.unavailableReason,
      mergePressure: 'normal',
      runningCount: 0,
      generatedAtIso,
    });

    return {
      availability: 'not_configured',
      generatedAtIso,
      counts: emptyCounts(),
      dispatch,
      mergeQueue: {
        openAgentPrs: 0,
        openAgentPrThreshold: AGENT_PR_THRESHOLD,
        pressure: 'normal',
      },
      runs: [],
      blockers,
      recommendations,
      sources: {
        github: sourceStatus(false, 0),
        linear: sourceStatus(false, 0),
        sentry: sourceStatus(false, 0),
        hermes: sourceStatus(true, recommendations.length),
        'hermes-air': sourceStatus(false, 0),
        ci: sourceStatus(false, 0),
      },
      errorMessage: 'GitHub HUD source not configured.',
    };
  }

  const [prsResult, runsResult] = await Promise.all([
    fetchGitHubJson(
      '/pulls?state=open&per_page=40',
      'GitHub open PRs for HUD AI ops'
    ),
    fetchGitHubJson(
      `/actions/workflows/${encodeURIComponent(HERMES_WORKER_WORKFLOW)}/runs?per_page=10`,
      'GitHub Hermes CLI workflow runs'
    ),
  ]);

  const prItems = prsResult.ok ? normalizePrItems(prsResult.payload, now) : [];
  const runItems = runsResult.ok
    ? normalizeWorkflowRuns(runsResult.payload, now)
    : [];
  const allItems = [...prItems, ...runItems];
  const blockers = allItems.filter(
    item =>
      item.status === 'blocked' ||
      item.status === 'failed' ||
      item.status === 'stale'
  );

  const openAgentPrs = prItems.length;
  const pressure =
    openAgentPrs >= AGENT_PR_THRESHOLD
      ? 'high'
      : openAgentPrs >= Math.ceil(AGENT_PR_THRESHOLD * 0.7)
        ? 'elevated'
        : 'normal';

  const recommendations = buildRecommendations({
    blockers,
    dispatchAvailable: dispatch.available,
    dispatchUnavailableReason: dispatch.unavailableReason,
    mergePressure: pressure,
    runningCount: allItems.filter(item => item.status === 'running').length,
    generatedAtIso,
  });

  const errorMessages = [
    prsResult.ok ? null : prsResult.errorMessage,
    runsResult.ok ? null : runsResult.errorMessage,
  ].filter((message): message is string => Boolean(message));
  const availability =
    errorMessages.length === 0
      ? 'available'
      : errorMessages.length === 2
        ? 'error'
        : 'partial';

  return {
    availability,
    generatedAtIso,
    counts: countStatuses(allItems),
    dispatch,
    mergeQueue: {
      openAgentPrs,
      openAgentPrThreshold: AGENT_PR_THRESHOLD,
      pressure,
    },
    runs: runItems.slice(0, 8),
    blockers: blockers.slice(0, 8),
    recommendations: recommendations.slice(0, 6),
    sources: {
      github: sourceStatus(
        true,
        prItems.length,
        prsResult.ok ? undefined : prsResult.errorMessage
      ),
      linear: sourceStatus(false, 0),
      sentry: sourceStatus(false, 0),
      hermes: sourceStatus(true, recommendations.length),
      'hermes-air': sourceStatus(false, 0),
      ci: sourceStatus(
        true,
        runItems.length,
        runsResult.ok ? undefined : runsResult.errorMessage
      ),
    },
    ...(errorMessages.length > 0
      ? { errorMessage: errorMessages.join('; ') }
      : {}),
  };
}
