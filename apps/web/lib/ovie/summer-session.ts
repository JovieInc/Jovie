/**
 * Authoritative current Summer session (JOV-5212).
 *
 * One current session id. Relaunch resumes it. Never forks, never mints a
 * fresh empty persona, never stores operator turns on customer Jovie chat.
 */

import type { OvieReceipt } from '@/lib/ovie/ingest';
import {
  SUMMER_MEMORY_NAMESPACE,
  type SummerSafeTool,
} from '@/lib/ovie/isolation';
import type { OperatingStore } from '@/lib/ovie/mcp/store';
import type { OvieDecision } from '@/lib/ovie/mcp/types';

export const CURRENT_SUMMER_SESSION_ID = 'summer-session:current' as const;
export const SUMMER_SESSION_SPEAKER = 'summer' as const;
export const SUMMER_SESSION_RUNTIME = 'eve' as const;
export const SUMMER_SESSION_DECISION_ID = 'dec_summer_session_current' as const;

export type SummerSessionIdentity = {
  readonly speaker: typeof SUMMER_SESSION_SPEAKER;
  readonly sessionId: typeof CURRENT_SUMMER_SESSION_ID;
  readonly memoryNamespace: typeof SUMMER_MEMORY_NAMESPACE;
  readonly runtime: typeof SUMMER_SESSION_RUNTIME;
  readonly authority: 'current';
};

export const CURRENT_SUMMER_IDENTITY: SummerSessionIdentity = {
  speaker: SUMMER_SESSION_SPEAKER,
  sessionId: CURRENT_SUMMER_SESSION_ID,
  memoryNamespace: SUMMER_MEMORY_NAMESPACE,
  runtime: SUMMER_SESSION_RUNTIME,
  authority: 'current',
};

export type SummerEveReceipt = {
  readonly eventId: string;
  readonly sessionId: string;
  readonly turnId: string;
  readonly nextStartIndex: number;
};
export type SummerEveCheckpoint = {
  readonly eventId: string;
  readonly sessionId: string | null;
  readonly nextStartIndex: number;
};

export type SummerPersistedTurn = {
  readonly eveReceipt?: SummerEveReceipt;
  readonly eveCheckpoint?: SummerEveCheckpoint;
  readonly turnIndex: number;
  readonly clientTurnId: string | null;
  readonly userText: string;
  readonly assistantText: string;
  readonly eveWorkId: string | null;
  readonly eveAcks: readonly string[];
  readonly correlationId: string;
  readonly state: string;
  readonly toolReceipt: SummerToolReceipt | null;
  readonly createdAt: string;
};

export type SummerToolReceipt = {
  readonly tool: SummerSafeTool;
  readonly ok: boolean;
  readonly receiptId: string;
  readonly summary: string;
};

export type SummerSession = {
  readonly identity: SummerSessionIdentity;
  readonly turns: readonly SummerPersistedTurn[];
};

export class SummerSessionError extends Error {
  constructor(
    readonly code: 'identity-drift' | 'session-fork' | 'duplicate-turn',
    message: string
  ) {
    super(message);
    this.name = 'SummerSessionError';
  }
}

function isSessionIdentity(value: unknown): value is SummerSessionIdentity {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Partial<SummerSessionIdentity>;
  return (
    row.speaker === SUMMER_SESSION_SPEAKER &&
    row.sessionId === CURRENT_SUMMER_SESSION_ID &&
    row.memoryNamespace === SUMMER_MEMORY_NAMESPACE &&
    row.runtime === SUMMER_SESSION_RUNTIME &&
    row.authority === 'current'
  );
}

function parseSession(value: unknown): SummerSession | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as { identity?: unknown; turns?: unknown };
  if (!isSessionIdentity(row.identity)) return null;
  if (!Array.isArray(row.turns)) return null;
  return {
    identity: row.identity,
    turns: row.turns as SummerPersistedTurn[],
  };
}

function emptySession(): SummerSession {
  return { identity: CURRENT_SUMMER_IDENTITY, turns: [] };
}

function toDecision(session: SummerSession, now: string): OvieDecision {
  return {
    id: SUMMER_SESSION_DECISION_ID,
    kind: 'decision',
    decided: JSON.stringify(session),
    why: 'Authoritative current Summer session for the Ovie door',
    provenance: 'summer-session',
    createdAt: now,
  };
}

export function assertSummerIdentity(
  identity: SummerSessionIdentity
): SummerSessionIdentity {
  if (
    identity.speaker !== SUMMER_SESSION_SPEAKER ||
    identity.sessionId !== CURRENT_SUMMER_SESSION_ID ||
    identity.memoryNamespace !== SUMMER_MEMORY_NAMESPACE ||
    identity.runtime !== SUMMER_SESSION_RUNTIME ||
    identity.authority !== 'current'
  ) {
    throw new SummerSessionError(
      'identity-drift',
      'Summer session identity drifted from the current Eve Summer'
    );
  }
  return identity;
}

export async function loadCurrentSummerSession(
  store: OperatingStore
): Promise<SummerSession | null> {
  const row = await store.getDecision(SUMMER_SESSION_DECISION_ID);
  if (!row?.decided) return null;
  try {
    const value = JSON.parse(row.decided) as {
      identity?: Record<string, unknown>;
      turns?: unknown;
    };
    // Explicit in-place Mac-to-Eve migration: preserve canonical ID and every recorded turn.
    if (value.identity?.runtime === 'mac') {
      const migrated = parseSession({
        ...value,
        identity: { ...value.identity, runtime: SUMMER_SESSION_RUNTIME },
      });
      if (!migrated)
        throw new SummerSessionError(
          'identity-drift',
          'Cannot migrate invalid Summer history'
        );
      await store.putDecision(toDecision(migrated, new Date().toISOString()));
      return migrated;
    }
    const parsed = parseSession(value);
    if (!parsed)
      throw new SummerSessionError(
        'identity-drift',
        'Stored Summer session is invalid'
      );
    assertSummerIdentity(parsed.identity);
    return parsed;
  } catch (error) {
    if (error instanceof SummerSessionError) throw error;
    throw new SummerSessionError(
      'identity-drift',
      'Cannot read or migrate stored Summer history'
    );
  }
}

export async function openCurrentSummerSession(
  store: OperatingStore,
  now: string = new Date().toISOString()
): Promise<SummerSession> {
  const existing = await loadCurrentSummerSession(store);
  if (existing) return existing;
  const session = emptySession();
  await store.putDecision(toDecision(session, now));
  return session;
}

export function findTurnByClientId(
  session: SummerSession,
  clientTurnId: string | null | undefined
): SummerPersistedTurn | undefined {
  if (!clientTurnId) return undefined;
  return session.turns.find(turn => turn.clientTurnId === clientTurnId);
}

export async function appendSummerTurn(
  store: OperatingStore,
  turn: Omit<SummerPersistedTurn, 'turnIndex'>,
  now: string = new Date().toISOString()
): Promise<SummerSession> {
  const session = await openCurrentSummerSession(store, now);
  assertSummerIdentity(session.identity);
  const duplicate = findTurnByClientId(session, turn.clientTurnId);
  if (duplicate && !shouldReplaceSummerTurn(duplicate, turn)) {
    return session;
  }
  const persisted: SummerPersistedTurn = duplicate
    ? { ...turn, turnIndex: duplicate.turnIndex }
    : { ...turn, turnIndex: session.turns.length + 1 };
  const next: SummerSession = {
    identity: session.identity,
    turns: duplicate
      ? session.turns.map(existing =>
          existing.clientTurnId === turn.clientTurnId ? persisted : existing
        )
      : [...session.turns, persisted],
  };
  await store.putDecision(toDecision(next, now));
  return next;
}

function shouldReplaceSummerTurn(
  existing: SummerPersistedTurn,
  next: Omit<SummerPersistedTurn, 'turnIndex'>
): boolean {
  if (existing.state === 'canceled') return true;
  const existingEmpty = existing.assistantText === '' && !existing.toolReceipt;
  const nextHasContent = next.assistantText !== '' || Boolean(next.toolReceipt);
  return existingEmpty && nextHasContent;
}

export function eveBindingFromReceipts(receipts: readonly OvieReceipt[]): {
  readonly eveWorkId: string | null;
  readonly eveAcks: readonly string[];
} {
  const withId = receipts.find(receipt => receipt.workId);
  return {
    eveWorkId: withId?.workId ?? receipts[0]?.workId ?? null,
    eveAcks: receipts.map(receipt => receipt.ack).filter(Boolean),
  };
}
