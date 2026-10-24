import 'server-only';
import { z } from 'zod';
import { getMeshAgent, MESH_AGENT_REGISTRY } from '@/lib/ovie/mesh/registry';
import type {
  MeshAgentSnapshot,
  MeshAgentStatus,
  MeshMailboxMessage,
  MeshReadPayload,
} from '@/lib/ovie/mesh/types';

/**
 * Read-only mesh aggregation for the Ovie Mesh page (JOV-8937).
 *
 * Three sources, all read server-side:
 *  1. the in-repo mesh registry (sender ids only — see registry.ts);
 *  2. mailbox records from the env-configured Summer mesh origin
 *     (GET `${JOVIE_MESH_URL ?? MESH_DEFAULT_URL}/summer/v1/mesh` — a
 *     mesh-level projection; Jovie holds no per-agent tokens, so it can never
 *     read agents' own mailboxes directly);
 *  3. the watcher log, carried by the same mesh payload.
 *
 * Jovie owns no Summer configuration beyond the established JOVIE_MESH_URL
 * env var, and it is read here only — never added to Jovie's config schema or
 * surfaces. Sources degrade to 'unknown' when unavailable; this module never
 * throws, and it never forwards token/hash/secret-shaped fields upstream
 * sends (they are stripped per-entry below).
 */

const MESH_DEFAULT_URL = 'https://summer.jov.ie';
const MESH_FETCH_TIMEOUT_MS = 5_000;

/** A row whose last received message is older than this is 'stale'. */
export const MESH_AGENT_FRESH_WINDOW_MS = 24 * 60 * 60 * 1000;

const meshMailboxMessageSchema = z.object({
  direction: z.enum(['sent', 'received']),
  summary: z.string().max(500),
  at: z.string().datetime({ offset: true }).nullable().optional(),
});

const meshMailboxRecordSchema = z.object({
  lastSentAt: z.string().datetime({ offset: true }).nullable().optional(),
  lastReceivedAt: z.string().datetime({ offset: true }).nullable().optional(),
  recentMessages: z.array(meshMailboxMessageSchema).optional(),
});

const meshWatcherEntrySchema = z.object({
  agentId: z.string().max(64).nullable().optional(),
  note: z.string().max(500),
});

export interface SummerMeshMailbox {
  readonly mailboxes: Record<
    string,
    {
      lastSentAt?: string | null;
      lastReceivedAt?: string | null;
      recentMessages?: MeshMailboxMessage[];
    }
  >;
  readonly watcherLog: ReadonlyArray<{ agentId: string | null; note: string }>;
}

/**
 * Resolve the Summer mesh origin from the environment (the CLI's
 * JOVIE_MESH_URL; same default). Returns null when unsafe (https only, no
 * embedded credentials, no loopback).
 */
export function getSummerMeshOrigin(
  environment: NodeJS.ProcessEnv = process.env
): string | null {
  const raw = environment.JOVIE_MESH_URL?.trim() || MESH_DEFAULT_URL;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(
    url.hostname.toLowerCase()
  );
  if (
    (url.protocol !== 'https:' && !loopback) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    return null;
  }
  return url.origin;
}

/**
 * Per-entry tolerant parse: one malformed record skips that entry instead of
 * failing the whole payload (which would blank every agent row).
 */
function parseMailboxPayload(payload: unknown): SummerMeshMailbox | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const rawMailboxes = (payload as Record<string, unknown>).mailboxes;
  const mailboxes: SummerMeshMailbox['mailboxes'] = {};
  if (
    rawMailboxes &&
    typeof rawMailboxes === 'object' &&
    !Array.isArray(rawMailboxes)
  ) {
    for (const [id, record] of Object.entries(
      rawMailboxes as Record<string, unknown>
    )) {
      const parsed = meshMailboxRecordSchema.safeParse(record);
      if (parsed.success) {
        mailboxes[id] = {
          lastSentAt: parsed.data.lastSentAt ?? null,
          lastReceivedAt: parsed.data.lastReceivedAt ?? null,
          recentMessages: parsed.data.recentMessages ?? [],
        };
      }
    }
  }
  const rawWatcher = (payload as Record<string, unknown>).watcherLog;
  const watcherLog: SummerMeshMailbox['watcherLog'] = [];
  if (Array.isArray(rawWatcher)) {
    for (const entry of rawWatcher) {
      const parsed = meshWatcherEntrySchema.safeParse(entry);
      if (parsed.success) {
        watcherLog.push({
          agentId: parsed.data.agentId ?? null,
          note: parsed.data.note,
        });
      }
    }
  }
  return { mailboxes, watcherLog };
}

async function fetchSummerMeshMailbox(
  origin: string,
  fetchImpl: typeof fetch
): Promise<SummerMeshMailbox | null> {
  try {
    const response = await fetchImpl(`${origin}/summer/v1/mesh`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(MESH_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return parseMailboxPayload(await response.json());
  } catch {
    return null;
  }
}

function deriveStatus(
  lastReceivedAt: string | null,
  now: number
): MeshAgentStatus {
  if (!lastReceivedAt) return 'stale';
  const receivedAt = Date.parse(lastReceivedAt);
  if (!Number.isFinite(receivedAt)) return 'stale';
  return now - receivedAt <= MESH_AGENT_FRESH_WINDOW_MS ? 'live' : 'stale';
}

/** Build the full read payload. Never throws; unavailable sources stay 'unknown'. */
export async function loadMeshRead(options?: {
  environment?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  now?: () => number;
}): Promise<MeshReadPayload> {
  const environment = options?.environment ?? process.env;
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  const now = options?.now ?? Date.now;

  const origin = getSummerMeshOrigin(environment);
  const mailbox = origin
    ? await fetchSummerMeshMailbox(origin, fetchImpl)
    : null;

  const nowMs = now();
  const gapsByAgent = new Map<string, string[]>();
  let watcherSource: MeshReadPayload['watcherSource'] = 'unavailable';
  if (mailbox) {
    watcherSource = 'ok';
    for (const entry of mailbox.watcherLog) {
      if (!entry.agentId || !getMeshAgent(entry.agentId)) continue;
      const gaps = gapsByAgent.get(entry.agentId) ?? [];
      if (!gaps.includes(entry.note)) gaps.push(entry.note);
      gapsByAgent.set(entry.agentId, gaps);
    }
  }

  const agents: MeshAgentSnapshot[] = MESH_AGENT_REGISTRY.map(agent => {
    const record = mailbox?.mailboxes[agent.id] ?? null;
    return {
      id: agent.id,
      label: agent.label,
      receiveMode: agent.receiveMode,
      meshKind: agent.meshKind,
      waitingOnTim: agent.waitingOnTim ?? null,
      status: mailbox
        ? // Source is available: a missing per-agent record means the agent
          // has been silent (stale), not that the source is unknown.
          deriveStatus(record?.lastReceivedAt ?? null, nowMs)
        : 'unknown',
      lastSentAt: record?.lastSentAt ?? null,
      lastReceivedAt: record?.lastReceivedAt ?? null,
      recentMessages: mailbox ? (record?.recentMessages ?? []) : null,
      gaps: mailbox ? (gapsByAgent.get(agent.id) ?? []) : null,
    };
  });

  return {
    schema: 'jovie.mesh-read/v1',
    mailboxSource: mailbox ? 'ok' : 'unavailable',
    watcherSource,
    agents,
  };
}
