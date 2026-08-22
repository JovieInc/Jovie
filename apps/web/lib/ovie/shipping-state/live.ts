import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { SHIPPING_SOURCE_SCHEMAS, type ShippingSourceId } from './contract';
import { parseTimestamp } from './envelope';
import { readMergeQueue, readWorkflow } from './live-github';
import {
  type AuthorityRead,
  disconnectedRead,
  type NamedAuthorityReaders,
} from './sources';

export {
  GITHUB_API_URL,
  GITHUB_GRAPHQL_URL,
} from './live-github';

export const NAMED_AUTHORITY_PATHS = {
  'symphony-runtime': '~/.local/lib/symphony-reconciler/runtime-receipt.json',
  'lease-guard-capacity':
    '~/.local/state/symphony-lease-guard/latest-report.json',
  'fleet-receipt':
    '/home/timwhite/gem-workspace/state/gem-priority-gate/latest.json',
} as const;

export const NAMED_AUTHORITY_URLS = {
  'symphony-runtime': 'http://127.0.0.1:4041/api/v1/state',
  'live-build-info': 'https://jov.ie/api/health/build-info',
} as const;

const ALLOWED_PATHS = new Set<string>(Object.values(NAMED_AUTHORITY_PATHS));

export type LiveIo = {
  readonly readFile: (path: string) => Promise<string>;
  readonly fetch: (url: string, init?: RequestInit) => Promise<Response>;
  readonly githubToken?: string;
  readonly githubOwner?: string;
  readonly githubRepo?: string;
};

function expandHome(path: string): string {
  if (path.startsWith('~/')) return resolve(homedir(), path.slice(2));
  return path;
}

export function resolveNamedAuthorityPath(
  sourceId: ShippingSourceId
): string | null {
  if (!(sourceId in NAMED_AUTHORITY_PATHS)) return null;
  const named =
    NAMED_AUTHORITY_PATHS[sourceId as keyof typeof NAMED_AUTHORITY_PATHS];
  return expandHome(named);
}

export function isAllowlistedAuthorityPath(path: string): boolean {
  const expanded = expandHome(path);
  for (const named of ALLOWED_PATHS) {
    if (expanded === expandHome(named) || path === named) return true;
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readNamedJson(
  io: LiveIo,
  sourceId: ShippingSourceId
): Promise<AuthorityRead | null> {
  const path = resolveNamedAuthorityPath(sourceId);
  if (path == null || !isAllowlistedAuthorityPath(path)) return null;
  try {
    const text = await io.readFile(path);
    const payload: unknown = JSON.parse(text);
    if (!isRecord(payload)) {
      return {
        sourceId,
        status: 'error',
        schema: null,
        payload: null,
        truncated: false,
        sourceTimestamp: null,
        sourceRevision: null,
        sequence: null,
        eventId: null,
        errorCode: 'malformed',
        errorMessage: 'named authority file was not an object',
      };
    }
    const schema = typeof payload.schema === 'string' ? payload.schema : null;
    return {
      sourceId,
      status: 'ok',
      schema: schema ?? SHIPPING_SOURCE_SCHEMAS[sourceId],
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
              : null,
      sequence: typeof payload.sequence === 'number' ? payload.sequence : null,
      eventId: typeof payload.eventId === 'string' ? payload.eventId : null,
      correlation: correlationFromPayload(sourceId, payload),
    };
  } catch (error) {
    const code =
      isRecord(error) && error.code === 'ENOENT'
        ? 'disconnected'
        : 'unavailable';
    return {
      sourceId,
      status: code,
      schema: null,
      payload: null,
      truncated: false,
      sourceTimestamp: null,
      sourceRevision: null,
      sequence: null,
      eventId: null,
      errorCode: code,
      errorMessage:
        error instanceof Error ? error.message : 'named authority unreadable',
    };
  }
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
      return {
        sourceId,
        status: 'unauthorized',
        schema: null,
        payload: null,
        truncated: false,
        sourceTimestamp: null,
        sourceRevision: null,
        sequence: null,
        eventId: null,
        errorCode: 'unauthorized',
        errorMessage: `named authority returned ${response.status}`,
      };
    }
    if (!response.ok) {
      return {
        sourceId,
        status: 'unavailable',
        schema: null,
        payload: null,
        truncated: false,
        sourceTimestamp: null,
        sourceRevision: null,
        sequence: null,
        eventId: null,
        errorCode: `http-${response.status}`,
        errorMessage: `named authority returned ${response.status}`,
      };
    }
    const payload: unknown = await response.json();
    if (!isRecord(payload)) {
      return {
        sourceId,
        status: 'error',
        schema: null,
        payload: null,
        truncated: false,
        sourceTimestamp: null,
        sourceRevision: null,
        sequence: null,
        eventId: null,
        errorCode: 'malformed',
        errorMessage: 'named authority payload was not an object',
      };
    }
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
        parseTimestamp(payload.observedAt) ?? parseTimestamp(payload.ts),
      sourceRevision:
        typeof payload.runtimeRevision === 'string'
          ? payload.runtimeRevision
          : typeof payload.commitSha === 'string'
            ? payload.commitSha
            : null,
      sequence: null,
      eventId: null,
      correlation: correlationFromPayload(sourceId, payload),
    };
  } catch (error) {
    return disconnectedRead(
      sourceId,
      error instanceof Error ? error.message : 'named authority unreachable'
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
      if (live.status === 'ok') return live;
      return file ?? live;
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
