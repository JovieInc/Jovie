/** Wire types for the read-only Ovie Mesh page (JOV-8937). Server-safe. */

/** How the agent receives mesh traffic. `relay` goes through Summer. */
export type MeshReceiveMode = 'direct' | 'relay';

/** Row status: fresh traffic, stale traffic, or source unavailable. */
export type MeshAgentStatus = 'live' | 'stale' | 'unknown';

/** Per-source availability so the UI can render 'unknown' without lying. */
export type MeshSourceAvailability = 'ok' | 'unavailable';

/**
 * Registry entry: sender ids and display metadata ONLY. This type must never
 * grow a token, hash, or secret field (enforced by registry.test.ts).
 */
export interface MeshAgentRegistryEntry {
  readonly id: string;
  readonly label: string;
  readonly receiveMode: MeshReceiveMode;
  /** Real mesh recipient name (MESH_KINDS); null = not pingable via mesh. */
  readonly meshKind: string | null;
  /** Curated waiting-on-Tim note (e.g. 'Rotation'), when one is known. */
  readonly waitingOnTim?: string;
}

export interface MeshMailboxMessage {
  readonly direction: 'sent' | 'received';
  readonly summary: string;
  /** ISO timestamp when the mesh source provides one; null otherwise. */
  readonly at: string | null;
}

/** One agent row in the mesh read payload. */
export interface MeshAgentSnapshot {
  readonly id: string;
  readonly label: string;
  readonly receiveMode: MeshReceiveMode;
  readonly meshKind: string | null;
  readonly waitingOnTim: string | null;
  readonly status: MeshAgentStatus;
  readonly lastSentAt: string | null;
  readonly lastReceivedAt: string | null;
  /** Null when the mailbox source is unavailable (render as 'unknown'). */
  readonly recentMessages: MeshMailboxMessage[] | null;
  /** Watcher-log gaps for the agent; null when that source is unavailable. */
  readonly gaps: string[] | null;
}

/** GET /api/admin/mesh response. */
export interface MeshReadPayload {
  readonly schema: 'jovie.mesh-read/v1';
  readonly mailboxSource: MeshSourceAvailability;
  readonly watcherSource: MeshSourceAvailability;
  readonly agents: readonly MeshAgentSnapshot[];
}
