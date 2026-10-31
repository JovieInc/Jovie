/**
 * "What changed since he last looked". The snapshot is the few numbers the
 * tiles already show, kept per browser: a deploy never resets it and it never
 * leaves the device. Differences read as one short line each, at most four.
 */
export const LAST_LOOKED_KEY = 'ovie.home.last-looked.v1';
/** A look shorter than this is the same visit, not a new one to compare against. */
export const MIN_LOOK_GAP_MS = 5 * 60_000;
const MAX_LINES = 4;

export interface LookedSnapshot {
  readonly at: number;
  readonly mrrUsd: number | null;
  readonly subscribers: number | null;
  readonly signups7d: number | null;
  readonly merges7d: number | null;
  readonly fleet: string | null;
  readonly askIds: readonly string[] | null;
}

export interface LastLookedSummary {
  readonly ageLabel: string;
  readonly lines: readonly string[];
}

export function ageLabel(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

const num = (value: number): string => value.toLocaleString('en-US');

/** Lines for what moved between two snapshots; empty when nothing did. */
export function summarizeSinceLastLooked(
  previous: LookedSnapshot,
  current: LookedSnapshot
): LastLookedSummary {
  const lines: string[] = [];
  if (
    previous.mrrUsd !== null &&
    current.mrrUsd !== null &&
    previous.mrrUsd !== current.mrrUsd
  ) {
    lines.push(`MRR $${num(previous.mrrUsd)} to $${num(current.mrrUsd)}`);
  }
  if (
    previous.subscribers !== null &&
    current.subscribers !== null &&
    previous.subscribers !== current.subscribers
  ) {
    const delta = current.subscribers - previous.subscribers;
    lines.push(`${delta > 0 ? '+' : ''}${delta} subscribers`);
  }
  if (
    previous.signups7d !== null &&
    current.signups7d !== null &&
    previous.signups7d !== current.signups7d
  ) {
    const delta = current.signups7d - previous.signups7d;
    lines.push(`${delta > 0 ? '+' : ''}${delta} signups (7d)`);
  }
  if (previous.fleet && current.fleet && previous.fleet !== current.fleet) {
    lines.push(`Fleet ${previous.fleet} to ${current.fleet}`);
  }
  if (previous.askIds && current.askIds) {
    const before = new Set(previous.askIds);
    const added = current.askIds.filter(id => !before.has(id)).length;
    const now = new Set(current.askIds);
    const cleared = previous.askIds.filter(id => !now.has(id)).length;
    if (added > 0)
      lines.push(`${added} new ${added === 1 ? 'decision' : 'decisions'}`);
    if (cleared > 0)
      lines.push(
        `${cleared} ${cleared === 1 ? 'decision' : 'decisions'} cleared`
      );
  }
  if (
    previous.merges7d !== null &&
    current.merges7d !== null &&
    current.merges7d !== previous.merges7d
  ) {
    const delta = current.merges7d - previous.merges7d;
    lines.push(`${delta > 0 ? '+' : ''}${delta} merges (7d)`);
  }
  return {
    ageLabel: ageLabel(current.at - previous.at),
    lines: lines.slice(0, MAX_LINES),
  };
}

export function parseSnapshot(raw: string | null): LookedSnapshot | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<LookedSnapshot>;
    return typeof value.at === 'number' && Number.isFinite(value.at)
      ? {
          at: value.at,
          mrrUsd: value.mrrUsd ?? null,
          subscribers: value.subscribers ?? null,
          signups7d: value.signups7d ?? null,
          merges7d: value.merges7d ?? null,
          fleet: value.fleet ?? null,
          askIds: Array.isArray(value.askIds) ? value.askIds : null,
        }
      : null;
  } catch {
    return null;
  }
}
