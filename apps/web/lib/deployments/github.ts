import 'server-only';

import { env } from '@/lib/env-server';
import { serverFetch } from '@/lib/http/server-fetch';
import type {
  HudDeploymentRun,
  HudDeploymentState,
  HudDeployments,
} from '@/types/hud';

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

const STATUS_TO_DEPLOYMENT_STATE: Record<string, HudDeploymentState> = {
  in_progress: 'in_progress',
  queued: 'in_progress',
};

const CONCLUSION_TO_DEPLOYMENT_STATE: Record<string, HudDeploymentState> = {
  success: 'success',
  failure: 'failure',
  cancelled: 'failure',
  timed_out: 'failure',
};

function formatDeploymentState(
  status: unknown,
  conclusion: unknown
): HudDeploymentState {
  const statusStr = String(status);
  const conclusionStr = String(conclusion);

  const statusState = STATUS_TO_DEPLOYMENT_STATE[statusStr];
  if (statusState) return statusState;

  if (statusStr === 'completed') {
    return CONCLUSION_TO_DEPLOYMENT_STATE[conclusionStr] ?? 'unknown';
  }

  return 'unknown';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export async function getHudDeployments(): Promise<HudDeployments> {
  const token = env.HUD_GITHUB_TOKEN;
  const owner = env.HUD_GITHUB_OWNER;
  const repo = env.HUD_GITHUB_REPO;
  const workflow = env.HUD_GITHUB_WORKFLOW;

  if (!token || !owner || !repo || !workflow) {
    return {
      availability: 'not_configured',
      current: null,
      recent: [],
    };
  }

  try {
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${encodeURIComponent(workflow)}/runs?per_page=6`;

    const response = await serverFetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      cache: 'no-store',
      context: 'GitHub workflow runs',
      retry: {
        maxRetries: 2,
        baseDelayMs: 500,
      },
    });

    if (!response.ok) {
      return {
        availability: 'error',
        current: null,
        recent: [],
        errorMessage: `GitHub API error (${response.status})`,
      };
    }

    const payload: unknown = await response.json();
    if (!isRecord(payload)) {
      return {
        availability: 'error',
        current: null,
        recent: [],
        errorMessage: 'Unexpected GitHub API response',
      };
    }

    const rawRuns = payload.workflow_runs;
    const runsArray = Array.isArray(rawRuns) ? rawRuns : [];

    const runs: HudDeploymentRun[] = runsArray
      .map((run: unknown): HudDeploymentRun | null => {
        if (!isRecord(run)) return null;

        const id = typeof run.id === 'number' ? run.id : null;
        const runNumber =
          typeof run.run_number === 'number' ? run.run_number : null;
        if (id == null || runNumber == null) return null;

        const status = formatDeploymentState(run.status, run.conclusion);
        const createdAtIso = normalizeIso(run.created_at);
        const branch =
          typeof run.head_branch === 'string' ? run.head_branch : null;
        const urlValue = typeof run.html_url === 'string' ? run.html_url : null;

        return { id, runNumber, status, createdAtIso, branch, url: urlValue };
      })
      .filter((run): run is HudDeploymentRun => run != null);

    return {
      availability: 'available',
      current: runs[0] ?? null,
      recent: runs.slice(0, 5),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      availability: 'error',
      current: null,
      recent: [],
      errorMessage: message,
    };
  }
}
