/**
 * Client durable ledger for dismissed chat proposal cards (JOV-3549).
 *
 * Dismissals are keyed by toolCallId and survive reload in the same browser.
 * Undo removes the entry so the proposal becomes actionable again.
 * Server turn-state reflection for the model is layered on when a tool event
 * is already `denied`; this ledger covers the common client-only dismiss path.
 */

const STORAGE_KEY = 'jovie:chat-proposal-dismissals:v1';

type LedgerMap = Record<string, true>;

function readLedger(): LedgerMap {
  if (typeof globalThis.localStorage === 'undefined') {
    return {};
  }
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return {};
    }
    const next: LedgerMap = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (value === true && typeof key === 'string' && key.length > 0) {
        next[key] = true;
      }
    }
    return next;
  } catch {
    return {};
  }
}

function writeLedger(map: LedgerMap): void {
  if (typeof globalThis.localStorage === 'undefined') {
    return;
  }
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Quota / private mode — non-fatal; in-memory session still works via React state.
  }
}

export function isProposalDismissed(toolCallId: string | undefined): boolean {
  if (!toolCallId) return false;
  return readLedger()[toolCallId] === true;
}

export function dismissProposal(toolCallId: string | undefined): void {
  if (!toolCallId) return;
  const map = readLedger();
  if (map[toolCallId]) return;
  map[toolCallId] = true;
  writeLedger(map);
}

export function undismissProposal(toolCallId: string | undefined): void {
  if (!toolCallId) return;
  const map = readLedger();
  if (!map[toolCallId]) return;
  delete map[toolCallId];
  writeLedger(map);
}
