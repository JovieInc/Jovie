import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { SHIPPING_SOURCE_SCHEMAS, type ShippingSourceId } from './contract';
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
  'symphony-runtime': '~/.local/lib/symphony-reconciler/runtime-receipt.json',
  'lease-guard-capacity':
    '~/.local/state/symphony-lease-guard/latest-report.json',
  'fleet-receipt': '~/gem-workspace/state/gem-priority-gate/latest.json',
} as const;

export const NAMED_AUTHORITY_URLS = {
  'symphony-runtime': 'http://127.0.0.1:4041/api/v1/state',
  'live-build-info': 'https://jov.ie/api/health/build-info',
} as const;

const ALLOWED_PATHS = new Set<string>(Object.values(NAMED_AUTHORITY_PATHS));
const MERGE_QUEUE_QUERY =
  'query ShippingStateMergeQueue($owner:String!,$name:String!){repository(owner:$owner,name:$name){mergeQueue(branch:"main"){entries(first:20){pageInfo{hasNextPage}nodes{id position state pullRequest{number headRefOid}}}}}}';

export type LiveIo = {
  readonly readFile: (path: string) => Promise<string>;
  readonly fetch: (url: string, init?: RequestInit) => Promise<Response>;
  readonly githubToken?: string;
  readonly githubOwner?: string;
  readonly githubRepo?: string;
};

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
  const response = await io.fetch(url, {
    ...init,
    signal: AbortSignal.timeout(2500),
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${io.githubToken}`,
      ...init.headers,
    },
  });
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
    const body: unknown = await response.json();
    const data = isRecord(body) && isRecord(body.data) ? body.data : null;
    const repository =
      data && isRecord(data.repository) ? data.repository : null;
    const queue =
      repository && isRecord(repository.mergeQueue)
        ? repository.mergeQueue
        : null;
    const entries = queue && isRecord(queue.entries) ? queue.entries : null;
    const nodes = entries && Array.isArray(entries.nodes) ? entries.nodes : [];
    const truncated =
      isRecord(entries?.pageInfo) && entries.pageInfo.hasNextPage === true;
    return {
      sourceId: 'github-native-merge-queue',
      status: 'ok',
      schema: SHIPPING_SOURCE_SCHEMAS['github-native-merge-queue'],
      payload: { entries: nodes, truncated },
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
    return disconnectedRead(
      'github-native-merge-queue',
      error instanceof Error ? error.message : 'merge queue unreachable'
    );
  }
}

export async function readWorkflow(
  io: LiveIo,
  sourceId: 'exact-sha-ci' | 'production-controller',
  workflow: string
): Promise<AuthorityRead> {
  const url = `${GITHUB_API_URL}/repos/${encodeURIComponent(io.githubOwner ?? '')}/${encodeURIComponent(io.githubRepo ?? '')}/actions/workflows/${encodeURIComponent(workflow)}/runs?per_page=5&exclude_pull_requests=true`;
  try {
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
    const runs =
      isRecord(body) && Array.isArray(body.workflow_runs)
        ? body.workflow_runs
        : [];
    const latest = runs.find(isRecord) ?? null;
    if (latest == null) {
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
    const sha = typeof latest.head_sha === 'string' ? latest.head_sha : null;
    const conclusion =
      typeof latest.conclusion === 'string' ? latest.conclusion : null;
    const verified =
      sourceId === 'production-controller' &&
      typeof latest.name === 'string' &&
      latest.name.includes('Production Verified');
    const green = conclusion === 'success';
    return {
      sourceId,
      status: 'ok',
      schema: SHIPPING_SOURCE_SCHEMAS[sourceId],
      payload: latest,
      truncated: runs.length >= 5,
      sourceTimestamp: parseTimestamp(latest.updated_at),
      sourceRevision: sha,
      sequence:
        typeof latest.run_number === 'number' ? latest.run_number : null,
      eventId: latest.id != null ? String(latest.id) : null,
      correlation: {
        sha,
        ciRunId: latest.id != null ? String(latest.id) : null,
        deploymentId: verified && green ? String(latest.id) : null,
      },
      errorCode: green ? undefined : 'ci-not-green',
      errorMessage: green ? undefined : (conclusion ?? 'ci-not-green'),
      measuredMeanings:
        sourceId === 'exact-sha-ci'
          ? { ciGreen: green }
          : { productionVerified: Boolean(verified && green) },
    };
  } catch (error) {
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
      const file = await readNamedJson(io, 'symphony-runtime');
      if (file && file.status === 'ok') return file;
      const live = await readNamedUrl(
        io,
        'symphony-runtime',
        NAMED_AUTHORITY_URLS['symphony-runtime'],
        750
      );
      return live.status === 'ok' ? live : (file ?? live);
    },
    'symphony-task': async () => {
      const runtime = await readNamedUrl(
        io,
        'symphony-task',
        NAMED_AUTHORITY_URLS['symphony-runtime'],
        750
      );
      return { ...runtime, sourceId: 'symphony-task' };
    },
    'lease-guard-capacity': async () => {
      const file = await readNamedJson(io, 'lease-guard-capacity');
      if (file) return file;
      const fleet = await readNamedJson(io, 'fleet-receipt');
      if (
        fleet?.status === 'ok' &&
        fleet.payload &&
        isRecord(fleet.payload.lease)
      ) {
        const lease = fleet.payload.lease;
        return {
          sourceId: 'lease-guard-capacity',
          status: lease.status === 'ok' ? 'ok' : 'unknown',
          schema: SHIPPING_SOURCE_SCHEMAS['lease-guard-capacity'],
          payload: lease,
          truncated: false,
          sourceTimestamp: parseTimestamp(lease.observedAt),
          sourceRevision: null,
          sequence: null,
          eventId: null,
          correlation: correlationFromPayload('lease-guard-capacity', lease),
        };
      }
      return disconnectedRead(
        'lease-guard-capacity',
        'lease-guard report missing'
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
    'fleet-receipt': async () =>
      (await readNamedJson(io, 'fleet-receipt')) ??
      disconnectedRead('fleet-receipt', 'fleet receipt missing'),
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
