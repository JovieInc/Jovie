import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import {
  isExactSha,
  SHIPPING_SOURCE_SCHEMAS,
  type ShippingSourceId,
} from './contract';
import { parseTimestamp } from './envelope';
import {
  type AuthorityRead,
  disconnectedRead,
  failedRead,
  isRecord,
  type NamedAuthorityReaders,
} from './sources';

export const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';
export const GITHUB_API_URL = 'https://api.github.com';

export const NAMED_AUTHORITY_PATHS = {
  'fleet-receipt': '~/gem-workspace/state/gem-priority-gate/latest.json',
} as const;

export const NAMED_AUTHORITY_URLS = {
  'symphony-runtime': 'http://127.0.0.1:4043/api/v1/state',
  'live-build-info': 'https://jov.ie/api/health/build-info',
} as const;

const ALLOWED_PATHS = new Set<string>(Object.values(NAMED_AUTHORITY_PATHS));
const MERGE_QUEUE_QUERY =
  'query ShippingStateMergeQueue($owner:String!,$name:String!){repository(owner:$owner,name:$name){pullRequests(states:OPEN,first:1){totalCount}mergeQueue(branch:"main"){entries(first:20){pageInfo{hasNextPage}nodes{id position state pullRequest{number headRefOid}}}}}}';
const PRODUCTION_VERIFIED_JOB_NAME = 'Production Verified';
const GITHUB_RATE_LIMIT_MIN_BACKOFF_MS = 60_000;
const GITHUB_RATE_LIMIT_MAX_BACKOFF_MS = 60 * 60_000;

export type LiveIo = {
  readonly readFile: (path: string) => Promise<string>;
  readonly fetch: (url: string, init?: RequestInit) => Promise<Response>;
  readonly githubToken?: string;
  readonly githubOwner?: string;
  readonly githubRepo?: string;
};

const githubBackoffUntilByIo = new WeakMap<LiveIo, number>();

function githubRateLimitBackoffMs(response: Response, nowMs: number): number {
  const retryAfterSeconds = Number(response.headers.get('retry-after'));
  const resetSeconds = Number(response.headers.get('x-ratelimit-reset'));
  const retryAfterMs = Number.isFinite(retryAfterSeconds)
    ? retryAfterSeconds * 1000
    : 0;
  const resetAfterMs = Number.isFinite(resetSeconds)
    ? resetSeconds * 1000 - nowMs
    : 0;
  return Math.min(
    GITHUB_RATE_LIMIT_MAX_BACKOFF_MS,
    Math.max(GITHUB_RATE_LIMIT_MIN_BACKOFF_MS, retryAfterMs, resetAfterMs)
  );
}

function expandHome(path: string): string {
  return path.startsWith('~/') ? resolve(homedir(), path.slice(2)) : path;
}

export function resolveNamedAuthorityPath(
  sourceId: ShippingSourceId
): string | null {
  if (!(sourceId in NAMED_AUTHORITY_PATHS)) return null;
  return expandHome(
    NAMED_AUTHORITY_PATHS[sourceId as keyof typeof NAMED_AUTHORITY_PATHS]
  );
}

export function isAllowlistedAuthorityPath(path: string): boolean {
  const expanded = expandHome(path);
  for (const named of ALLOWED_PATHS) {
    if (expanded === expandHome(named) || path === named) return true;
  }
  return false;
}

function shaFromSignals(signals: Record<string, unknown>): string | null {
  const main = isRecord(signals.main) ? signals.main : null;
  return typeof main?.sha === 'string' ? main.sha : null;
}

function correlationFromPayload(
  sourceId: ShippingSourceId,
  payload: Record<string, unknown>
) {
  const signals = isRecord(payload.signals) ? payload.signals : null;
  const main = signals && isRecord(signals.main) ? signals.main : null;
  const production =
    signals && isRecord(signals.production) ? signals.production : null;
  return {
    workId: typeof payload.issue === 'string' ? payload.issue : null,
    leaseId:
      sourceId === 'lease-guard-capacity'
        ? 'lease-guard'
        : typeof payload.leaseId === 'string'
          ? payload.leaseId
          : null,
    prNumber: typeof payload.prNumber === 'number' ? payload.prNumber : null,
    ciRunId:
      typeof payload.runId === 'string' || typeof payload.runId === 'number'
        ? String(payload.runId)
        : null,
    deploymentId:
      typeof production?.deploymentId === 'string'
        ? production.deploymentId
        : null,
    buildId: typeof payload.buildId === 'string' ? payload.buildId : null,
    sha:
      typeof payload.commitSha === 'string'
        ? payload.commitSha
        : typeof payload.head_sha === 'string'
          ? payload.head_sha
          : typeof main?.sha === 'string'
            ? main.sha
            : typeof production?.deployedSha === 'string'
              ? production.deployedSha
              : null,
  };
}

function okFileRead(
  sourceId: ShippingSourceId,
  payload: Record<string, unknown>
): AuthorityRead {
  return {
    sourceId,
    status: 'ok',
    schema:
      typeof payload.schema === 'string'
        ? payload.schema
        : SHIPPING_SOURCE_SCHEMAS[sourceId],
    payload,
    truncated: false,
    sourceTimestamp:
      parseTimestamp(payload.ts) ??
      parseTimestamp(payload.observedAt) ??
      parseTimestamp(payload.generated_at) ??
      parseTimestamp(payload.installedAt),
    sourceRevision:
      typeof payload.runtimeRevision === 'string'
        ? payload.runtimeRevision
        : typeof payload.sourceRevision === 'string'
          ? payload.sourceRevision
          : isRecord(payload.signals)
            ? shaFromSignals(payload.signals)
            : typeof payload.commitSha === 'string'
              ? payload.commitSha
              : null,
    sequence: typeof payload.sequence === 'number' ? payload.sequence : null,
    eventId: typeof payload.eventId === 'string' ? payload.eventId : null,
    correlation: correlationFromPayload(sourceId, payload),
  };
}

async function readNamedJson(
  io: LiveIo,
  sourceId: ShippingSourceId
): Promise<AuthorityRead | null> {
  const path = resolveNamedAuthorityPath(sourceId);
  if (path == null || !isAllowlistedAuthorityPath(path)) return null;
  try {
    const payload: unknown = JSON.parse(await io.readFile(path));
    if (!isRecord(payload)) {
      return failedRead(
        sourceId,
        'error',
        'named authority file was not an object',
        { errorCode: 'malformed' }
      );
    }
    return okFileRead(sourceId, payload);
  } catch (error) {
    const code =
      isRecord(error) && error.code === 'ENOENT'
        ? 'disconnected'
        : 'unavailable';
    return failedRead(
      sourceId,
      code,
      error instanceof Error ? error.message : 'named authority unreadable',
      { errorCode: code }
    );
  }
}

async function readNamedUrl(
  io: LiveIo,
  sourceId: ShippingSourceId,
  url: string,
  timeoutMs: number
): Promise<AuthorityRead> {
  try {
    const response = await io.fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status === 401 || response.status === 403) {
      return failedRead(
        sourceId,
        'unauthorized',
        `named authority returned ${response.status}`
      );
    }
    if (!response.ok) {
      return failedRead(
        sourceId,
        'unavailable',
        `named authority returned ${response.status}`,
        { errorCode: `http-${response.status}` }
      );
    }
    const payload: unknown = await response.json();
    if (!isRecord(payload)) {
      return failedRead(
        sourceId,
        'error',
        'named authority payload was not an object',
        { errorCode: 'malformed' }
      );
    }
    return okFileRead(sourceId, payload);
  } catch (error) {
    return disconnectedRead(
      sourceId,
      error instanceof Error ? error.message : 'named authority unreachable'
    );
  }
}

async function githubFetch(
  io: LiveIo,
  sourceId: ShippingSourceId,
  url: string,
  init: RequestInit
): Promise<Response | AuthorityRead> {
  if (!io.githubToken || !io.githubOwner || !io.githubRepo) {
    return failedRead(
      sourceId,
      'unavailable',
      'GitHub credentials are not configured'
    );
  }
  const nowMs = Date.now();
  if ((githubBackoffUntilByIo.get(io) ?? 0) > nowMs) {
    return failedRead(sourceId, 'unavailable', 'GitHub request rate limited', {
      errorCode: 'rate-limited',
    });
  }
  const response = await io.fetch(url, {
    ...init,
    signal: AbortSignal.timeout(2500),
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${io.githubToken}`,
      ...init.headers,
    },
  });
  const rateLimited =
    response.status === 429 ||
    (response.status === 403 &&
      (response.headers.get('x-ratelimit-remaining') === '0' ||
        response.headers.has('retry-after')));
  if (rateLimited) {
    githubBackoffUntilByIo.set(
      io,
      nowMs + githubRateLimitBackoffMs(response, nowMs)
    );
    return failedRead(sourceId, 'unavailable', 'GitHub request rate limited', {
      errorCode: 'rate-limited',
    });
  }
  if (response.status === 401 || response.status === 403) {
    return failedRead(
      sourceId,
      'unauthorized',
      `GitHub returned ${response.status}`
    );
  }
  return response;
}

export async function readMergeQueue(io: LiveIo): Promise<AuthorityRead> {
  try {
    const response = await githubFetch(
      io,
      'github-native-merge-queue',
      GITHUB_GRAPHQL_URL,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          query: MERGE_QUEUE_QUERY,
          variables: { owner: io.githubOwner, name: io.githubRepo },
        }),
      }
    );
    if (!('ok' in response)) return response;
    if (!response.ok) {
      return failedRead(
        'github-native-merge-queue',
        'unavailable',
        `GitHub merge queue returned ${response.status}`,
        { errorCode: `http-${response.status}` }
      );
    }

    const body: unknown = await response.json();
    if (
      !isRecord(body) ||
      ('errors' in body &&
        (!Array.isArray(body.errors) || body.errors.length > 0))
    ) {
      return failedRead(
        'github-native-merge-queue',
        'unavailable',
        'GitHub merge queue GraphQL response was unavailable',
        { errorCode: 'graphql-error' }
      );
    }

    const data = isRecord(body.data) ? body.data : null;
    const repository =
      data && isRecord(data.repository) ? data.repository : null;
    const queue =
      repository && isRecord(repository.mergeQueue)
        ? repository.mergeQueue
        : null;
    const entries = queue && isRecord(queue.entries) ? queue.entries : null;
    const pageInfo =
      entries && isRecord(entries.pageInfo) ? entries.pageInfo : null;
    const pullRequests =
      repository && isRecord(repository.pullRequests)
        ? repository.pullRequests
        : null;
    const openPullRequests = pullRequests?.totalCount;
    const nodes = entries?.nodes;
    const validNode = (node: unknown): boolean => {
      if (!isRecord(node) || !isRecord(node.pullRequest)) return false;
      return (
        typeof node.id === 'string' &&
        Number.isInteger(node.position) &&
        Number(node.position) >= 1 &&
        typeof node.state === 'string' &&
        Number.isInteger(node.pullRequest.number) &&
        Number(node.pullRequest.number) >= 1 &&
        typeof node.pullRequest.headRefOid === 'string'
      );
    };
    if (
      !repository ||
      !pullRequests ||
      !queue ||
      !entries ||
      !pageInfo ||
      !Array.isArray(nodes) ||
      !nodes.every(validNode) ||
      !Number.isInteger(openPullRequests) ||
      Number(openPullRequests) < 0 ||
      typeof pageInfo.hasNextPage !== 'boolean' ||
      (pageInfo.hasNextPage && nodes.length === 0)
    ) {
      return failedRead(
        'github-native-merge-queue',
        'unavailable',
        'GitHub merge queue response was malformed',
        { errorCode: 'malformed' }
      );
    }
    const truncated = pageInfo.hasNextPage;
    return {
      sourceId: 'github-native-merge-queue',
      status: 'ok',
      schema: SHIPPING_SOURCE_SCHEMAS['github-native-merge-queue'],
      payload: {
        entries: nodes,
        truncated,
        openPullRequests: Number(openPullRequests),
      },
      truncated,
      sourceTimestamp: null,
      sourceRevision:
        nodes.length > 0 && isRecord(nodes[0])
          ? String(nodes[0].id ?? '')
          : 'empty',
      sequence: null,
      eventId: null,
      measuredMeanings: { queued: nodes.length > 0 },
    };
  } catch (error) {
    return failedRead(
      'github-native-merge-queue',
      'unavailable',
      error instanceof Error ? error.message : 'merge queue unavailable',
      { errorCode: 'unavailable' }
    );
  }
}

export async function readWorkflow(
  io: LiveIo,
  sourceId: 'exact-sha-ci' | 'production-controller',
  workflow: string
): Promise<AuthorityRead> {
  const repositoryUrl = `${GITHUB_API_URL}/repos/${encodeURIComponent(io.githubOwner ?? '')}/${encodeURIComponent(io.githubRepo ?? '')}`;
  const query =
    sourceId === 'exact-sha-ci'
      ? 'branch=main&event=push&per_page=5&exclude_pull_requests=true'
      : 'per_page=5&exclude_pull_requests=true';
  const url = `${repositoryUrl}/actions/workflows/${encodeURIComponent(workflow)}/runs?${query}`;
  try {
    let currentMainSha: string | null = null;
    if (sourceId === 'exact-sha-ci') {
      const mainResponse = await githubFetch(
        io,
        sourceId,
        `${repositoryUrl}/commits/main`,
        {}
      );
      if (!('ok' in mainResponse)) return mainResponse;
      if (!mainResponse.ok) {
        return failedRead(
          sourceId,
          'unavailable',
          `GitHub current main returned ${mainResponse.status}`,
          { errorCode: `http-${mainResponse.status}` }
        );
      }
      const mainBody: unknown = await mainResponse.json();
      currentMainSha =
        isRecord(mainBody) && isExactSha(mainBody.sha)
          ? String(mainBody.sha)
          : null;
      if (!currentMainSha) {
        return failedRead(
          sourceId,
          'unavailable',
          'GitHub current main response was malformed',
          { errorCode: 'malformed' }
        );
      }
    }

    const response = await githubFetch(io, sourceId, url, {});
    if (!('ok' in response)) return response;
    if (!response.ok) {
      return failedRead(
        sourceId,
        'unavailable',
        `GitHub Actions returned ${response.status}`,
        { errorCode: `http-${response.status}` }
      );
    }
    const body: unknown = await response.json();
    if (
      !isRecord(body) ||
      !Array.isArray(body.workflow_runs) ||
      !body.workflow_runs.every(isRecord)
    ) {
      return failedRead(
        sourceId,
        'unavailable',
        'GitHub Actions runs response was malformed',
        { errorCode: 'malformed' }
      );
    }
    const runs = body.workflow_runs;
    const latest =
      sourceId === 'exact-sha-ci'
        ? (runs.find(
            run =>
              run.event === 'push' &&
              run.head_branch === 'main' &&
              run.head_sha === currentMainSha
          ) ?? null)
        : (runs[0] ?? null);
    if (latest == null) {
      if (sourceId === 'exact-sha-ci' && currentMainSha) {
        return failedRead(
          sourceId,
          'unavailable',
          'Current main has no matching push CI run',
          {
            errorCode: 'current-main-run-missing',
            sourceRevision: currentMainSha,
            correlation: { sha: currentMainSha },
          }
        );
      }
      return {
        sourceId,
        status: 'ok',
        schema: SHIPPING_SOURCE_SCHEMAS[sourceId],
        payload: { workflow_runs: [] },
        truncated: false,
        sourceTimestamp: null,
        sourceRevision: 'empty',
        sequence: null,
        eventId: null,
      };
    }
    const sha = isExactSha(latest.head_sha) ? String(latest.head_sha) : null;
    const conclusion =
      typeof latest.conclusion === 'string' ? latest.conclusion : null;
    const green = conclusion === 'success';

    if (sourceId === 'production-controller') {
      const runId =
        typeof latest.id === 'string' || typeof latest.id === 'number'
          ? String(latest.id)
          : null;
      const runAttempt = latest.run_attempt;
      if (
        !runId ||
        !Number.isInteger(runAttempt) ||
        Number(runAttempt) < 1 ||
        !isExactSha(sha)
      ) {
        return failedRead(
          sourceId,
          'unavailable',
          'Production Controller run identity was malformed',
          { errorCode: 'malformed' }
        );
      }

      const jobsUrl = `${GITHUB_API_URL}/repos/${encodeURIComponent(io.githubOwner ?? '')}/${encodeURIComponent(io.githubRepo ?? '')}/actions/runs/${encodeURIComponent(runId)}/attempts/${String(runAttempt)}/jobs?per_page=100`;
      const jobsResponse = await githubFetch(io, sourceId, jobsUrl, {});
      if (!('ok' in jobsResponse)) return jobsResponse;
      if (!jobsResponse.ok) {
        return failedRead(
          sourceId,
          'unavailable',
          `Production Controller jobs returned ${jobsResponse.status}`,
          { errorCode: `http-${jobsResponse.status}` }
        );
      }
      const jobsBody: unknown = await jobsResponse.json();
      if (
        !isRecord(jobsBody) ||
        !Number.isInteger(jobsBody.total_count) ||
        Number(jobsBody.total_count) < 0 ||
        !Array.isArray(jobsBody.jobs) ||
        !jobsBody.jobs.every(isRecord) ||
        jobsBody.total_count !== jobsBody.jobs.length
      ) {
        return failedRead(
          sourceId,
          'unavailable',
          'Production Controller jobs response was malformed or incomplete',
          { errorCode: 'malformed' }
        );
      }
      const verifiedJobs = jobsBody.jobs.filter(
        job => job.name === PRODUCTION_VERIFIED_JOB_NAME
      );
      if (verifiedJobs.length > 1) {
        return failedRead(
          sourceId,
          'unavailable',
          'Production Controller returned duplicate verification jobs',
          { errorCode: 'malformed' }
        );
      }
      const verifiedJob = verifiedJobs[0] ?? null;
      if (
        verifiedJob &&
        (String(verifiedJob.run_id) !== runId ||
          verifiedJob.run_attempt !== runAttempt ||
          verifiedJob.head_sha !== sha)
      ) {
        return failedRead(
          sourceId,
          'unavailable',
          'Production Controller verification job did not match its run',
          { errorCode: 'identity-mismatch' }
        );
      }
      const verified = Boolean(
        verifiedJob?.status === 'completed' &&
          verifiedJob.conclusion === 'success'
      );
      return {
        sourceId,
        status: 'ok',
        schema: SHIPPING_SOURCE_SCHEMAS[sourceId],
        payload: { ...latest, productionVerifiedJob: verifiedJob },
        truncated: false,
        sourceTimestamp:
          parseTimestamp(verifiedJob?.completed_at) ??
          parseTimestamp(latest.updated_at),
        sourceRevision: sha,
        sequence:
          typeof latest.run_number === 'number' ? latest.run_number : null,
        eventId: runId,
        correlation: {
          sha,
          ciRunId: runId,
          deploymentId: null,
        },
        errorCode: verified ? undefined : 'production-not-verified',
        errorMessage: verified
          ? undefined
          : typeof verifiedJob?.conclusion === 'string'
            ? verifiedJob.conclusion
            : 'production-not-verified',
        measuredMeanings: { productionVerified: verified },
      };
    }

    return {
      sourceId,
      status: 'ok',
      schema: SHIPPING_SOURCE_SCHEMAS[sourceId],
      payload: latest,
      // This reader's authority is the latest run only. Older-run pagination
      // does not make that first record partial.
      truncated: false,
      sourceTimestamp: parseTimestamp(latest.updated_at),
      sourceRevision: sha,
      sequence:
        typeof latest.run_number === 'number' ? latest.run_number : null,
      eventId: latest.id != null ? String(latest.id) : null,
      correlation: {
        sha,
        ciRunId: latest.id != null ? String(latest.id) : null,
        deploymentId: null,
      },
      errorCode: green ? undefined : 'ci-not-green',
      errorMessage: green ? undefined : (conclusion ?? 'ci-not-green'),
      measuredMeanings:
        sourceId === 'exact-sha-ci' ? { ciGreen: green } : undefined,
    };
  } catch (error) {
    if (sourceId === 'production-controller') {
      return failedRead(
        sourceId,
        'unavailable',
        error instanceof Error
          ? error.message
          : 'Production Controller unavailable',
        { errorCode: 'unavailable' }
      );
    }
    return disconnectedRead(
      sourceId,
      error instanceof Error ? error.message : 'workflow unreachable'
    );
  }
}

async function defaultReadFile(path: string): Promise<string> {
  if (!isAllowlistedAuthorityPath(path)) {
    throw new Error('refused-arbitrary-path');
  }
  return readFile(path, 'utf8');
}

export function createLiveShippingStateReaders(
  io: LiveIo
): NamedAuthorityReaders {
  return {
    'symphony-runtime': async () => {
      const live = await readNamedUrl(
        io,
        'symphony-runtime',
        NAMED_AUTHORITY_URLS['symphony-runtime'],
        750
      );
      if (live.status !== 'ok') return live;
      if (
        !live.payload ||
        !Array.isArray(live.payload.running) ||
        !Array.isArray(live.payload.retrying) ||
        !Array.isArray(live.payload.blocked) ||
        live.sourceTimestamp == null
      ) {
        return failedRead(
          'symphony-runtime',
          'unavailable',
          'Official Symphony state response was malformed',
          { errorCode: 'malformed' }
        );
      }
      return { ...live, schema: 'symphony-runtime-state/v1' };
    },
    'symphony-task': async () => {
      return failedRead(
        'symphony-task',
        'unavailable',
        'Official Symphony task receipt is not configured',
        { errorCode: 'not-configured' }
      );
    },
    'lease-guard-capacity': async () => {
      const fleet = await readNamedJson(io, 'fleet-receipt');
      const signals =
        fleet?.status === 'ok' &&
        fleet.payload &&
        isRecord(fleet.payload.signals)
          ? fleet.payload.signals
          : null;
      if (fleet?.status === 'ok' && signals && isRecord(signals.lease)) {
        const lease = signals.lease;
        const capacity = isRecord(lease.capacity) ? lease.capacity : null;
        const observedAt = parseTimestamp(lease.observedAt);
        if (
          !capacity ||
          !Number.isSafeInteger(capacity.available) ||
          Number(capacity.available) < 0 ||
          !observedAt
        ) {
          return failedRead(
            'lease-guard-capacity',
            'unavailable',
            'Canonical fleet lease signal was malformed',
            { errorCode: 'malformed' }
          );
        }
        return {
          sourceId: 'lease-guard-capacity',
          status: 'ok',
          schema: SHIPPING_SOURCE_SCHEMAS['lease-guard-capacity'],
          payload: lease,
          truncated: false,
          sourceTimestamp: observedAt,
          sourceRevision: fleet.sourceRevision,
          sequence: fleet.sequence,
          eventId: fleet.eventId,
          correlation: correlationFromPayload('lease-guard-capacity', lease),
        };
      }
      return failedRead(
        'lease-guard-capacity',
        fleet?.status ?? 'disconnected',
        fleet?.errorMessage ?? 'canonical fleet lease signal missing',
        { errorCode: fleet?.errorCode ?? 'missing-lease-signal' }
      );
    },
    'github-native-merge-queue': () => readMergeQueue(io),
    'exact-sha-ci': () => readWorkflow(io, 'exact-sha-ci', 'ci.yml'),
    'production-controller': () =>
      readWorkflow(io, 'production-controller', 'production-controller.yml'),
    'live-build-info': () =>
      readNamedUrl(
        io,
        'live-build-info',
        NAMED_AUTHORITY_URLS['live-build-info'],
        2500
      ),
    'fleet-receipt': async () => {
      const fleet =
        (await readNamedJson(io, 'fleet-receipt')) ??
        disconnectedRead('fleet-receipt', 'fleet receipt missing');
      if (fleet.status === 'ok' && fleet.sourceTimestamp == null) {
        return failedRead(
          'fleet-receipt',
          'unavailable',
          'Canonical fleet receipt timestamp was malformed',
          { errorCode: 'malformed' }
        );
      }
      return fleet;
    },
  };
}

export function defaultLiveIo(overrides: Partial<LiveIo> = {}): LiveIo {
  return {
    readFile: overrides.readFile ?? defaultReadFile,
    fetch: overrides.fetch ?? fetch,
    githubToken: overrides.githubToken,
    githubOwner: overrides.githubOwner,
    githubRepo: overrides.githubRepo,
  };
}
