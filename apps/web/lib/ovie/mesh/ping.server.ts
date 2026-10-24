import 'server-only';

/**
 * Server-side mesh ping transport (JOV-8937).
 *
 * Sends a `jovie.mesh-ping/v1` test message to an agent by POSTing to the
 * env-configured Summer mesh endpoint. Jovie attaches no credentials here —
 * the mesh host's own boundary applies. Never throws; the caller maps the
 * failure reason onto a response status.
 */
export const MESH_PING_SCHEMA = 'jovie.mesh-ping/v1';

const MESH_PING_TIMEOUT_MS = 5_000;

export type MeshPingResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: 'upstream-error' | 'upstream-unreachable';
    };

export async function sendMeshPing(options: {
  readonly agentId: string;
  readonly origin: string;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
}): Promise<MeshPingResult> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const now = options.now ?? Date.now;

  try {
    const response = await fetchImpl(`${options.origin}/summer/v1/mesh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        schema: MESH_PING_SCHEMA,
        type: 'ping',
        agentId: options.agentId,
        sentAt: new Date(now()).toISOString(),
      }),
      signal: AbortSignal.timeout(MESH_PING_TIMEOUT_MS),
    });
    if (!response.ok) return { ok: false, reason: 'upstream-error' };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'upstream-unreachable' };
  }
}
