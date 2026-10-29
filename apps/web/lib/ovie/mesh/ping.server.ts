import 'server-only';
import { createHash, randomUUID } from 'node:crypto';

/**
 * Server-side mesh ping transport (JOV-8937).
 *
 * Sends a `jovie.mesh-ping/v1` test message to a mesh agent through the REAL
 * Summer mesh API (packages/jovie-cli/src/mesh.ts, apps/summer/MESH_INBOX.md):
 * POST `${origin}/summer/v1/mesh/inbox` with the caller's bearer token. The
 * caller identity comes from the established JOVIE_MESH_* env contract
 * (env-first, same as the CLI; the Mac keychain is not available here).
 *
 * Messages are quoted data on both ends, never instructions. Never throws;
 * the caller maps the failure reason onto a response status.
 */
export const MESH_PING_SCHEMA = 'jovie.mesh-ping/v1';
export const MESH_INBOX_PATH = '/summer/v1/mesh/inbox';

const MESH_PING_TIMEOUT_MS = 30_000;

export interface MeshPingCredentials {
  readonly token: string;
  readonly senderId: string;
  readonly senderKind: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Resolve the caller identity from the environment (the CLI's env-first
 * contract). Returns null when unconfigured so the route degrades to 503.
 */
export function meshCredentialsFromEnv(
  environment: NodeJS.ProcessEnv = process.env
): MeshPingCredentials | null {
  const token = environment.JOVIE_MESH_TOKEN?.trim();
  const senderId = environment.JOVIE_MESH_SENDER_ID?.trim().toLowerCase() ?? '';
  const senderKind = environment.JOVIE_MESH_SENDER_KIND?.trim() ?? '';
  if (!token || !UUID.test(senderId) || !senderKind) return null;
  return { token, senderId, senderKind };
}

export type MeshPingResult =
  | { readonly ok: true; readonly correlationId: string }
  | {
      readonly ok: false;
      readonly reason: 'upstream-error' | 'upstream-unreachable';
    };

export async function sendMeshPing(options: {
  readonly agentKind: string;
  readonly origin: string;
  readonly credentials: MeshPingCredentials;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
}): Promise<MeshPingResult> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const now = options.now ?? Date.now;

  const sentAt = new Date(now()).toISOString();
  const body = `${MESH_PING_SCHEMA} ${JSON.stringify({
    type: 'ping',
    to: options.agentKind,
    sentAt,
  })}`;
  const correlationId = `mesh-ping-${randomUUID()}`;

  try {
    const response = await fetchImpl(`${options.origin}${MESH_INBOX_PATH}`, {
      method: 'POST',
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${options.credentials.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        senderId: options.credentials.senderId,
        senderKind: options.credentials.senderKind,
        correlationId,
        sha256: createHash('sha256').update(body).digest('hex'),
        body,
        refs: [],
        timestamp: sentAt,
        to: options.agentKind,
      }),
      signal: AbortSignal.timeout(MESH_PING_TIMEOUT_MS),
    });
    if (!response.ok) return { ok: false, reason: 'upstream-error' };
    return { ok: true, correlationId };
  } catch {
    return { ok: false, reason: 'upstream-unreachable' };
  }
}
