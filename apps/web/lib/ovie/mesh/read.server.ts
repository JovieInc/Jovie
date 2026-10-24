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
 *  2. mailbox records from the env-configured Summer mesh endpoint
 *     (GET `${SUMMER_MESH_ORIGIN}/summer/v1/mesh`);
 *  3. the watcher log, carried by the same mesh payload.
 *
 * Jovie owns no Summer configuration beyond this one origin env var, and it
 * is read here only — never added to Jovie's config schema or surfaces.
 * Every source degrades to 'unknown' when unavailable; this module never
 * throws, and it never forwards token/hash/secret-shaped fields upstream
 * sends (they are dropped by the schema below).
 */

const MESH_FETCH_TIMEOUT_MS = 5_000;

/** A row whose last received message is older than this is 'stale'. */
export const MESH_AGENT_FRESH_WINDOW_MS = 24 * 60 * 60 * 1000;

const meshMailboxMessageSchema = z.object({
  direction: z.enum(['sent', 'received']),
  summary: z.string().max(500),
  at: z.string().datetime({ offset: true }).nullable().optional(),
});

const meshMailboxRecordSchema = z
  .object({
    lastSentAt: z.string().datetime({ offset: true }).nullable().optional(),
    lastReceivedAt: z.string().datetime({ offset: true }).nullable().optional(),
    recentMessages: z.array(meshMailboxMessageSchema).max(50).optional(),
  })
  .strip();

const meshWatcherEntrySchema = z
  .object({
    agentId: z.string().max(64).nullable().optional(),
    note: z.string().max(500),
  })
  .strip();

const meshMailboxPayloadSchema = z
  .object({
    mailboxes: z.record(z.string(), meshMailboxRecordSchema).optional(),
    watcherLog: z.array(meshWatcherEntrySchema).max(500).optional(),
  })
  .strip();

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
 * Resolve the Summer mesh origin from the environment. Returns null when
 * unset or unsafe (https only, no embedded credentials).
 */
export function getSummerMeshOrigin(
  environment: NodeJS.ProcessEnv = process.env
): string | null {
  const raw = environment.SUMMER_MESH_ORIGIN?.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    return null;
  }
  return url.origin;
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
    const parsed = meshMailboxPayloadSchema.safeParse(await response.json());
    if (!parsed.success) return null;
    return {
      mailboxes: parsed.data.mailboxes ?? {},
      watcherLog: parsed.data.watcherLog ?? [],
    };
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
    const record = mailbox?.mailboxes[agent.id];
    return {
      id: agent.id,
      label: agent.label,
      receiveMode: agent.receiveMode,
      waitingOnTim: agent.waitingOnTim ?? null,
      status:
        mailbox && record
          ? deriveStatus(record.lastReceivedAt ?? null, nowMs)
          : 'unknown',
      lastSentAt: record?.lastSentAt ?? null,
      lastReceivedAt: record?.lastReceivedAt ?? null,
      recentMessages: record?.recentMessages ?? null,
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
