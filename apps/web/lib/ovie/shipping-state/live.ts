import {
  DELIVERY_MERGE_REPOS,
  type DeliveryLane,
  type DeliveryLanes,
  type DeliveryMergeRepo,
  isExactSha,
  measuredCount,
  NOT_MEASURED_COUNT,
  SHIPPING_SOURCE_SCHEMAS,
  type ShippingSourceId,
} from './contract';
import { parseTimestamp, sanitizeOpaqueIdentifier } from './envelope';
import {
  type AuthorityRead,
  type AuthorityReader,
  disconnectedRead,
  failedRead,
  isRecord,
  type NamedAuthorityReaders,
} from './sources';

export const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';
export const GITHUB_API_URL = 'https://api.github.com';

/**
 * Public, read-only delivery authorities. The lanes harness publishes
 * `symphony-lanes-status/v1` to a gist; Summer serves its own runtime health.
 * Everything else is GitHub, read with the HUD token.
 */
export const NAMED_AUTHORITY_URLS = {
  'lanes-status':
    'https://gist.githubusercontent.com/itstimwhite/07ec460956451da7632fe852934f21c5/raw/lanes-status.json',
  'live-build-info': 'https://jov.ie/api/health/build-info',
  'summer-runtime': 'https://summer.jov.ie/runtime/v1/health',
} as const;

/**
 * Per-source read reuse. The publisher polls every few seconds; GitHub search
 * and GraphQL budgets are shared with every other HUD read, so slow-moving
 * counts are reused for longer than the poll. Failures retry sooner.
 */
export const SOURCE_CACHE_TTL_MS = {
  'lanes-status': 10_000,
  'lane-pull-requests': 15_000,
  'github-merges': 60_000,
  'live-build-info': 30_000,
  'summer-runtime': 30_000,
} as const satisfies Partial<Record<ShippingSourceId, number>>;
const FAILED_READ_CACHE_TTL_MS = 5_000;
const PUBLIC_SOURCE_TIMEOUT_MS = 3_000;
const GITHUB_TIMEOUT_MS = 2_500;
/** Search with `mergeable` computes merge state per PR; it runs ~2.5s. */
const LANE_SEARCH_TIMEOUT_MS = 6_000;
const LANE_BRANCH_PREFIXES = ['devin', 'codex'] as const;
const LANES_STATUS_SCHEMA = 'symphony-lanes-status/v1';
const LANE_BRANCH_RE = /^(?:devin|codex)\//;
const DAY_MS = 24 * 60 * 60_000;

const MERGE_QUEUE_QUERY =
  'query ShippingStateMergeQueue($owner:String!,$name:String!){repository(owner:$owner,name:$name){pullRequests(states:OPEN,first:1){totalCount}mergeQueue(branch:"main"){entries(first:20){totalCount pageInfo{hasNextPage}nodes{id position state pullRequest{number headRefOid}}}}}}';
const LANE_PR_FIELDS =
  'issueCount nodes{... on PullRequest{number title headRefName headRefOid isDraft mergeable reviewDecision updatedAt mergeQueueEntry{position}}}';
const LANE_PULL_REQUESTS_QUERY = `query ShippingStateLanePullRequests($query:String!){search(type:ISSUE,first:100,query:$query){${LANE_PR_FIELDS}}}`;
const MERGES_QUERY =
  'query ShippingStateMerges($org:String!,$jovie:String!,$lyb:String!,$summer:String!,$last7:String!,$prior7:String!){org:search(type:ISSUE,query:$org,first:1){issueCount}jovie:search(type:ISSUE,query:$jovie,first:1){issueCount}lyb:search(type:ISSUE,query:$lyb,first:1){issueCount}summer:search(type:ISSUE,query:$summer,first:1){issueCount}last7:search(type:ISSUE,query:$last7,first:1){issueCount}prior7:search(type:ISSUE,query:$prior7,first:1){issueCount}}';
const BEHIND_MAIN_QUERY =
  'query ShippingStateBehindMain($owner:String!,$name:String!,$sha:String!){repository(owner:$owner,name:$name){ref(qualifiedName:"main"){compare(headRef:$sha){behindBy}}}}';
const PRODUCTION_VERIFIED_JOB_NAME = 'Production Verified';
const GITHUB_RATE_LIMIT_MIN_BACKOFF_MS = 60_000;
const GITHUB_RATE_LIMIT_MAX_BACKOFF_MS = 60 * 60_000;

export type LiveIo = {
  readonly fetch: (url: string, init?: RequestInit) => Promise<Response>;
  readonly githubToken?: string;
  /** Preferred over githubToken: resolves a fresh (bot) token per call. */
  readonly getGithubToken?: () => Promise<string | undefined>;
  readonly githubOwner?: string;
  readonly githubRepo?: string;
  readonly nowMs?: () => number;
  /**
   * Optional authenticated bridge to the Gem execution host. When present,
   * Gem-resident authorities are read over this transport instead of the
   * public feed that only exists once Gem publishes it.
   */
  readonly gemBridge?: GemBridge;
};

export type GemBridge = {
  readonly url: string;
  readonly token: string;
};

/**
 * Fixed receipt keys the Gem bridge may serve. Each maps to exactly one
 * `GET {bridge}/receipts/{key}` — the transport can never address an
 * arbitrary path, log, or command surface.
 */
export const GEM_BRIDGE_RECEIPT_KEYS = {
  'lanes-status': 'lanes-status',
} as const satisfies Partial<Record<ShippingSourceId, string>>;

const GEM_BRIDGE_TIMEOUT_MS = 2_500;

export function gemBridgeReceiptUrl(
  bridge: GemBridge,
  sourceId: ShippingSourceId
): string | null {
  const key = (
    GEM_BRIDGE_RECEIPT_KEYS as Partial<Record<ShippingSourceId, string>>
  )[sourceId];
  if (key == null || bridge.token.length === 0) return null;
  let base: URL;
  try {
    base = new URL(bridge.url);
  } catch {
    return null;
  }
  if (
    (base.protocol !== 'https:' && base.protocol !== 'http:') ||
    base.username !== '' ||
    base.password !== '' ||
    base.search !== '' ||
    base.hash !== ''
  ) {
    return null;
  }
  let prefix = base.pathname;
  while (prefix.length > 1 && prefix.endsWith('/')) {
    prefix = prefix.slice(0, -1);
  }
  if (prefix === '/') prefix = '';
  return `${base.origin}${prefix}/receipts/${key}`;
}

async function readJsonAuthority(
  io: LiveIo,
  sourceId: ShippingSourceId,
  url: string,
  timeoutMs: number,
  authority: string,
  malformedMessage: string,
  headers: Record<string, string> = {}
): Promise<AuthorityRead> {
  try {
    const response = await io.fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json', ...headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status === 401 || response.status === 403) {
      return failedRead(
        sourceId,
        'unauthorized',
        `${authority} returned ${response.status}`
      );
    }
    if (!response.ok) {
      return failedRead(
        sourceId,
        'unavailable',
        `${authority} returned ${response.status}`,
        { errorCode: `http-${response.status}` }
      );
    }
    const payload: unknown = await response.json();
    if (!isRecord(payload)) {
      return failedRead(sourceId, 'error', malformedMessage, {
        errorCode: 'malformed',
      });
    }
    return okJsonRead(sourceId, payload);
  } catch (error) {
    return disconnectedRead(
      sourceId,
      error instanceof Error ? error.message : `${authority} unreachable`
    );
  }
}

async function readBridgeReceipt(
  io: LiveIo,
  sourceId: ShippingSourceId
): Promise<AuthorityRead> {
  const url = io.gemBridge ? gemBridgeReceiptUrl(io.gemBridge, sourceId) : null;
  if (url == null) {
    return failedRead(
      sourceId,
      'unavailable',
      'Gem bridge receipt is not configured',
      { errorCode: 'not-configured' }
    );
  }
  return readJsonAuthority(
    io,
    sourceId,
    url,
    GEM_BRIDGE_TIMEOUT_MS,
    'Gem bridge',
    'Gem bridge receipt was not an object',
    { authorization: `Bearer ${io.gemBridge?.token ?? ''}` }
  );
}

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

function nowOf(io: LiveIo): number {
  return io.nowMs ? io.nowMs() : Date.now();
}

/** Start of "today" for merge counts: midnight in America/Los_Angeles. */
export function pacificMidnightIso(nowMs: number): string {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const offsetAt = (ms: number) => {
    const parts = format.formatToParts(new Date(ms));
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find(p => p.type === type)?.value);
    const wall = Date.UTC(
      part('year'),
      part('month') - 1,
      part('day'),
      part('hour'),
      part('minute'),
      part('second')
    );
    return {
      offsetMs: wall - Math.floor(ms / 1000) * 1000,
      midnightWall: Date.UTC(part('year'), part('month') - 1, part('day')),
    };
  };
  const { offsetMs, midnightWall } = offsetAt(nowMs);
  // Re-read the offset at the candidate so a DST change after midnight
  // does not move the boundary by an hour.
  const candidate = midnightWall - offsetMs;
  return githubSearchTime(midnightWall - offsetAt(candidate).offsetMs);
}

function githubSearchTime(ms: number): string {
  return new Date(Math.floor(ms / 1000) * 1000)
    .toISOString()
    .replace('.000Z', 'Z');
}

function cachedReader(
  io: LiveIo,
  reader: AuthorityReader,
  ttlMs: number
): AuthorityReader {
  let cached: {
    readonly expiresAt: number;
    read: Promise<AuthorityRead>;
  } | null = null;
  return () => {
    const now = nowOf(io);
    if (cached && now < cached.expiresAt) return cached.read;
    const entry = { expiresAt: now + ttlMs, read: reader() };
    cached = entry;
    void entry.read.then(
      read => {
        if (read.status !== 'ok' && cached === entry) {
          cached = {
            ...entry,
            expiresAt: Math.min(
              entry.expiresAt,
              nowOf(io) + FAILED_READ_CACHE_TTL_MS
            ),
          };
        }
      },
      () => {
        if (cached === entry) cached = null;
      }
    );
    return entry.read;
  };
}

function okJsonRead(
  sourceId: ShippingSourceId,
  payload: Record<string, unknown>
): AuthorityRead {
  const sha = isExactSha(payload.commitSha) ? payload.commitSha : null;
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
      parseTimestamp(payload.at) ??
      parseTimestamp(payload.ts) ??
      parseTimestamp(payload.observedAt),
    sourceRevision: sha,
    sequence: null,
    eventId: null,
    correlation: {
      sha,
      buildId: typeof payload.buildId === 'string' ? payload.buildId : null,
    },
  };
}

async function readNamedUrl(
  io: LiveIo,
  sourceId: ShippingSourceId,
  url: string,
  timeoutMs: number
): Promise<AuthorityRead> {
  return readJsonAuthority(
    io,
    sourceId,
    url,
    timeoutMs,
    'named authority',
    'named authority payload was not an object'
  );
}

async function githubFetch(
  io: LiveIo,
  sourceId: ShippingSourceId,
  url: string,
  init: RequestInit,
  timeoutMs = GITHUB_TIMEOUT_MS
): Promise<Response | AuthorityRead> {
  const githubToken = io.getGithubToken
    ? await io.getGithubToken()
    : io.githubToken;
  if (!githubToken || !io.githubOwner || !io.githubRepo) {
    return failedRead(
      sourceId,
      'unavailable',
      'GitHub credentials are not configured'
    );
  }
  const nowMs = nowOf(io);
  if ((githubBackoffUntilByIo.get(io) ?? 0) > nowMs) {
    return failedRead(sourceId, 'unavailable', 'GitHub request rate limited', {
      errorCode: 'rate-limited',
    });
  }
  const response = await io.fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${githubToken}`,
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
      (pageInfo.hasNextPage && nodes.length === 0) ||
      !Number.isInteger(entries.totalCount) ||
      Number(entries.totalCount) < nodes.length
    ) {
      return failedRead(
        'github-native-merge-queue',
        'unavailable',
        'GitHub merge queue response was malformed',
        { errorCode: 'malformed' }
      );
    }
    const truncated = pageInfo.hasNextPage;
    const totalCount = Number(entries.totalCount);
    return {
      sourceId: 'github-native-merge-queue',
      status: 'ok',
      schema: SHIPPING_SOURCE_SCHEMAS['github-native-merge-queue'],
      payload: {
        entries: nodes,
        totalCount,
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
      measuredMeanings: { queued: totalCount > 0 },
      delivery: { mergeQueueDepth: measuredCount(totalCount) },
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

function countRecord(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  const out: Record<string, number> = {};
  for (const [key, count] of Object.entries(value)) {
    const safeKey = sanitizeOpaqueIdentifier(key, 64);
    if (safeKey && Number.isSafeInteger(count) && Number(count) >= 0) {
      out[safeKey] = Number(count);
    }
  }
  return out;
}

function nonNegativeCount(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? measuredCount(Math.floor(value))
    : NOT_MEASURED_COUNT;
}

/** Validate a `symphony-lanes-status/v1` document into the lanes block. */
export function parseLanesStatus(
  payload: Record<string, unknown>
): DeliveryLanes | null {
  if (payload.schema !== LANES_STATUS_SCHEMA) return null;
  const publishedAt = parseTimestamp(payload.at);
  if (!publishedAt || !isRecord(payload.lanes)) return null;
  const lanes: DeliveryLane[] = [];
  for (const [name, lane] of Object.entries(payload.lanes)) {
    const safeName = sanitizeOpaqueIdentifier(name, 64);
    if (
      !safeName ||
      !isRecord(lane) ||
      !Number.isSafeInteger(lane.running) ||
      !Number.isSafeInteger(lane.slots) ||
      Number(lane.running) < 0 ||
      Number(lane.slots) < 0
    ) {
      return null;
    }
    lanes.push({
      name: safeName,
      running: Number(lane.running),
      slots: Number(lane.slots),
    });
  }
  if (!Number.isSafeInteger(payload.running) || Number(payload.running) < 0) {
    return null;
  }
  const alerts = isRecord(payload.alerts)
    ? Object.values(payload.alerts)
        .filter((alert): alert is string => typeof alert === 'string')
        .map(alert => alert.replace(/\s+/g, ' ').trim().slice(0, 160))
        .filter(Boolean)
        .slice(0, 5)
    : [];
  return {
    running: measuredCount(Number(payload.running)),
    slots: measuredCount(lanes.reduce((sum, lane) => sum + lane.slots, 0)),
    idle: nonNegativeCount(payload.idle),
    pool: nonNegativeCount(payload.pool),
    lastLandingAgeSeconds: nonNegativeCount(payload.lastLandingAgeS),
    diskFreePct:
      typeof payload.diskFreePct === 'number' &&
      Number.isFinite(payload.diskFreePct)
        ? payload.diskFreePct
        : null,
    lanes,
    alerts,
    heldByReason: countRecord(payload.held_by_reason),
    failedByReason: countRecord(payload.failed_by_reason),
    publishedAt,
    stale: false,
  };
}

export async function readLanesStatus(io: LiveIo): Promise<AuthorityRead> {
  const read = io.gemBridge
    ? await readBridgeReceipt(io, 'lanes-status')
    : await readNamedUrl(
        io,
        'lanes-status',
        NAMED_AUTHORITY_URLS['lanes-status'],
        PUBLIC_SOURCE_TIMEOUT_MS
      );
  if (read.status !== 'ok' || !read.payload) return read;
  const lanes = parseLanesStatus(read.payload);
  if (!lanes) {
    return failedRead(
      'lanes-status',
      'unavailable',
      'Lanes status feed was malformed',
      { errorCode: 'malformed' }
    );
  }
  return {
    ...read,
    sourceRevision: sanitizeOpaqueIdentifier(read.payload.release),
    delivery: { lanes },
  };
}

async function githubGraphql(
  io: LiveIo,
  sourceId: ShippingSourceId,
  query: string,
  variables: Record<string, unknown>,
  timeoutMs = GITHUB_TIMEOUT_MS
): Promise<Record<string, unknown> | AuthorityRead> {
  const response = await githubFetch(
    io,
    sourceId,
    GITHUB_GRAPHQL_URL,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    },
    timeoutMs
  );
  if (!('ok' in response)) return response;
  if (!response.ok) {
    return failedRead(
      sourceId,
      'unavailable',
      `GitHub GraphQL returned ${response.status}`,
      { errorCode: `http-${response.status}` }
    );
  }
  const body: unknown = await response.json();
  if (
    !isRecord(body) ||
    !isRecord(body.data) ||
    (Array.isArray(body.errors) && body.errors.length > 0)
  ) {
    return failedRead(
      sourceId,
      'unavailable',
      'GitHub GraphQL response was unavailable',
      { errorCode: 'graphql-error' }
    );
  }
  return body.data;
}

function isAuthorityRead(value: unknown): value is AuthorityRead {
  return (
    isRecord(value) && typeof value.status === 'string' && 'sourceId' in value
  );
}

function malformed(sourceId: ShippingSourceId, message: string) {
  return failedRead(sourceId, 'unavailable', message, {
    errorCode: 'malformed',
  });
}

function unreachable(sourceId: ShippingSourceId, error: unknown) {
  return failedRead(
    sourceId,
    'unavailable',
    error instanceof Error ? error.message : `${sourceId} unavailable`,
    { errorCode: 'unavailable' }
  );
}

/**
 * Open lane PRs (`devin/`, `codex/` heads) via one search request per poll.
 * Dependabot and human branches are excluded by construction.
 */
export async function readLanePullRequests(io: LiveIo): Promise<AuthorityRead> {
  const sourceId = 'lane-pull-requests' as const;
  const repo = `repo:${io.githubOwner ?? ''}/${io.githubRepo ?? ''}`;
  try {
    // One search per lane, in parallel: each is bounded by merge-state work.
    const settled = await Promise.allSettled(
      LANE_BRANCH_PREFIXES.map(lane =>
        githubGraphql(
          io,
          sourceId,
          LANE_PULL_REQUESTS_QUERY,
          { query: `${repo} is:pr is:open head:${lane}/` },
          LANE_SEARCH_TIMEOUT_MS
        )
      )
    );
    const pullRequests: Record<string, unknown>[] = [];
    let truncated = false;
    let firstFailure: AuthorityRead | null = null;
    let succeeded = 0;
    for (const outcome of settled) {
      // One lane failing must not discard the lanes that answered; report partial as truncated.
      if (outcome.status === 'rejected') {
        firstFailure ??= unreachable(sourceId, outcome.reason);
        continue;
      }
      const data = outcome.value;
      if (isAuthorityRead(data)) {
        firstFailure ??= data;
        continue;
      }
      succeeded += 1;
      const search = data.search;
      if (
        !isRecord(search) ||
        !Number.isSafeInteger(search.issueCount) ||
        !Array.isArray(search.nodes)
      ) {
        return malformed(sourceId, 'GitHub lane pull requests were malformed');
      }
      if (Number(search.issueCount) > search.nodes.length) truncated = true;
      for (const node of search.nodes) {
        if (
          !isRecord(node) ||
          !Number.isSafeInteger(node.number) ||
          typeof node.headRefName !== 'string'
        ) {
          return malformed(sourceId, 'GitHub pull request was malformed');
        }
        // Search matches `head:` loosely; the branch prefix is the contract.
        if (!LANE_BRANCH_RE.test(node.headRefName)) continue;
        const queueEntry = isRecord(node.mergeQueueEntry)
          ? node.mergeQueueEntry
          : null;
        pullRequests.push({
          number: node.number,
          title: node.title,
          headRefName: node.headRefName,
          headRefOid: node.headRefOid,
          isDraft: node.isDraft === true,
          mergeable: node.mergeable,
          reviewDecision: node.reviewDecision,
          updatedAt: node.updatedAt,
          mergeQueuePosition: Number.isInteger(queueEntry?.position)
            ? queueEntry?.position
            : null,
        });
      }
    }
    if (succeeded === 0 && firstFailure) return firstFailure;
    if (firstFailure) truncated = true;
    return {
      sourceId,
      status: 'ok',
      schema: SHIPPING_SOURCE_SCHEMAS[sourceId],
      payload: { pullRequests },
      truncated,
      sourceTimestamp: null,
      sourceRevision: null,
      sequence: null,
      eventId: null,
      delivery: truncated
        ? {}
        : { inFlight: measuredCount(pullRequests.length) },
    };
  } catch (error) {
    return unreachable(sourceId, error);
  }
}

function issueCount(data: Record<string, unknown>, alias: string) {
  const search = data[alias];
  return isRecord(search) &&
    Number.isSafeInteger(search.issueCount) &&
    Number(search.issueCount) >= 0
    ? Number(search.issueCount)
    : null;
}

/**
 * Merged PRs since Pacific midnight per repo and org-wide, plus the last
 * seven days against the seven before for week-over-week. One GraphQL
 * request of `search.issueCount`, so it costs a single rate-limit point.
 */
export async function readMerges(io: LiveIo): Promise<AuthorityRead> {
  const sourceId = 'github-merges' as const;
  const owner = io.githubOwner ?? '';
  const nowMs = nowOf(io);
  const since = pacificMidnightIso(nowMs);
  const weekAgo = githubSearchTime(nowMs - 7 * DAY_MS);
  const twoWeeksAgo = githubSearchTime(nowMs - 14 * DAY_MS);
  const merged = 'is:pr is:merged';
  const repoQuery = (repo: DeliveryMergeRepo) =>
    `repo:${owner}/${repo} ${merged} merged:>=${since}`;
  try {
    const data = await githubGraphql(io, sourceId, MERGES_QUERY, {
      org: `org:${owner} ${merged} merged:>=${since}`,
      jovie: repoQuery('Jovie'),
      lyb: repoQuery('LogYourBody'),
      summer: repoQuery('summer-config'),
      last7: `org:${owner} ${merged} merged:>=${weekAgo}`,
      prior7: `org:${owner} ${merged} merged:${twoWeeksAgo}..${weekAgo}`,
    });
    if (isAuthorityRead(data)) return data;
    const today = issueCount(data, 'org');
    const byRepo: Record<DeliveryMergeRepo, number | null> = {
      Jovie: issueCount(data, 'jovie'),
      LogYourBody: issueCount(data, 'lyb'),
      'summer-config': issueCount(data, 'summer'),
    };
    const last7 = issueCount(data, 'last7');
    const prior7 = issueCount(data, 'prior7');
    if (
      today == null ||
      last7 == null ||
      prior7 == null ||
      DELIVERY_MERGE_REPOS.some(repo => byRepo[repo] == null)
    ) {
      return malformed(sourceId, 'GitHub merge counts were malformed');
    }
    const count = (value: number | null) =>
      value == null ? NOT_MEASURED_COUNT : measuredCount(value);
    return {
      sourceId,
      status: 'ok',
      schema: SHIPPING_SOURCE_SCHEMAS[sourceId],
      payload: { since, today, byRepo, last7, prior7 },
      truncated: false,
      sourceTimestamp: null,
      sourceRevision: null,
      sequence: null,
      eventId: null,
      measuredMeanings: { merged: today > 0 },
      delivery: {
        merges: {
          since,
          today: measuredCount(today),
          byRepo: {
            Jovie: count(byRepo.Jovie),
            LogYourBody: count(byRepo.LogYourBody),
            'summer-config': count(byRepo['summer-config']),
          },
          last7Days: measuredCount(last7),
          prior7Days: measuredCount(prior7),
        },
      },
    };
  } catch (error) {
    return unreachable(sourceId, error);
  }
}

async function readBehindMain(io: LiveIo, sha: string) {
  try {
    const data = await githubGraphql(io, 'live-build-info', BEHIND_MAIN_QUERY, {
      owner: io.githubOwner,
      name: io.githubRepo,
      sha,
    });
    if (isAuthorityRead(data)) return NOT_MEASURED_COUNT;
    const repository = isRecord(data.repository) ? data.repository : null;
    const ref = repository && isRecord(repository.ref) ? repository.ref : null;
    const compare = ref && isRecord(ref.compare) ? ref.compare : null;
    return compare && Number.isSafeInteger(compare.behindBy)
      ? nonNegativeCount(compare.behindBy)
      : NOT_MEASURED_COUNT;
  } catch {
    return NOT_MEASURED_COUNT;
  }
}

/** jov.ie build-info plus how many main commits production is missing. */
export async function readLiveBuild(io: LiveIo): Promise<AuthorityRead> {
  const read = await readNamedUrl(
    io,
    'live-build-info',
    NAMED_AUTHORITY_URLS['live-build-info'],
    PUBLIC_SOURCE_TIMEOUT_MS
  );
  if (read.status !== 'ok' || !read.payload) return read;
  const payload = read.payload;
  const sha = isExactSha(payload.commitSha) ? payload.commitSha : null;
  const deployedAt =
    typeof payload.deployedAt === 'number' &&
    Number.isFinite(payload.deployedAt)
      ? new Date(payload.deployedAt).toISOString()
      : parseTimestamp(payload.deployedAt);
  return {
    ...read,
    delivery: {
      production: {
        sha,
        version: sanitizeOpaqueIdentifier(payload.version, 32),
        deployedAt,
        behindMain: sha ? await readBehindMain(io, sha) : NOT_MEASURED_COUNT,
      },
    },
  };
}

/** Summer's public runtime health channel (`/runtime/v1/health`). */
export async function readSummerRuntime(io: LiveIo): Promise<AuthorityRead> {
  const read = await readNamedUrl(
    io,
    'summer-runtime',
    NAMED_AUTHORITY_URLS['summer-runtime'],
    PUBLIC_SOURCE_TIMEOUT_MS
  );
  if (read.status !== 'ok' || !read.payload) return read;
  const { identity } = read.payload;
  // Deployed Summer reports `availability`; the checked-in materializer reports `status`.
  const availability = read.payload.availability ?? read.payload.status;
  if (identity !== 'summer' || typeof availability !== 'string') {
    return malformed('summer-runtime', 'Summer runtime health was malformed');
  }
  return {
    ...read,
    delivery: {
      summer: {
        availability:
          availability === 'up' || availability === 'down'
            ? availability
            : 'degraded',
      },
    },
  };
}

export function createLiveShippingStateReaders(
  io: LiveIo
): NamedAuthorityReaders {
  return {
    'lanes-status': cachedReader(
      io,
      () => readLanesStatus(io),
      SOURCE_CACHE_TTL_MS['lanes-status']
    ),
    'lane-pull-requests': cachedReader(
      io,
      () => readLanePullRequests(io),
      SOURCE_CACHE_TTL_MS['lane-pull-requests']
    ),
    'github-native-merge-queue': () => readMergeQueue(io),
    'github-merges': cachedReader(
      io,
      () => readMerges(io),
      SOURCE_CACHE_TTL_MS['github-merges']
    ),
    'exact-sha-ci': () => readWorkflow(io, 'exact-sha-ci', 'ci.yml'),
    'production-controller': () =>
      readWorkflow(io, 'production-controller', 'production-controller.yml'),
    'live-build-info': cachedReader(
      io,
      () => readLiveBuild(io),
      SOURCE_CACHE_TTL_MS['live-build-info']
    ),
    'summer-runtime': cachedReader(
      io,
      () => readSummerRuntime(io),
      SOURCE_CACHE_TTL_MS['summer-runtime']
    ),
  };
}

export function defaultLiveIo(overrides: Partial<LiveIo> = {}): LiveIo {
  return {
    fetch: overrides.fetch ?? fetch,
    githubToken: overrides.githubToken,
    ...(overrides.getGithubToken
      ? { getGithubToken: overrides.getGithubToken }
      : {}),
    githubOwner: overrides.githubOwner,
    githubRepo: overrides.githubRepo,
    ...(overrides.nowMs ? { nowMs: overrides.nowMs } : {}),
    gemBridge: overrides.gemBridge,
  };
}
