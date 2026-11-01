import type { ProofStatDefinition } from './registry';

export interface ProofStatObservation {
  readonly value: number;
  /** ISO time the value was measured (not when it was stored). */
  readonly measuredAt: string;
  readonly source: string;
  readonly receipt?: string | null;
  /** Founder approval for comparative/health claims (Summer card id). */
  readonly approval?: {
    readonly cardId: string;
    readonly approvedAt: string;
  } | null;
}
export type ProofStatState =
  | 'publishable'
  | 'missing'
  | 'stale'
  | 'below-threshold'
  | 'above-ceiling'
  | 'internal'
  | 'unapproved'
  | 'not-live';
export interface ResolvedProofStat {
  readonly id: string;
  readonly state: ProofStatState;
  readonly value: string | null;
  readonly sentence: string | null;
  readonly fallback: string | null;
  readonly label: string;
  readonly methodology: string | null;
  readonly measuredAt: string | null;
  readonly rawValue: number | null;
}
const HOUR_MS = 60 * 60 * 1000;
function trimZeros(text: string): string {
  return text.includes('.') ? text.replace(/\.?0+$/u, '') : text;
}
export function roundConservative(
  value: number,
  rounding: ProofStatDefinition['display']['rounding']
): number {
  if (rounding.mode === 'exact' || value === 0) return value;
  const fn = rounding.mode === 'floor' ? Math.floor : Math.ceil;
  if (rounding.step) {
    // Snap to the step grid; the epsilon absorbs float noise (0.29 / 0.01).
    const units = value / rounding.step;
    const snapped = fn(rounding.mode === 'floor' ? units + 1e-9 : units - 1e-9);
    return Number((snapped * rounding.step).toPrecision(12));
  }
  const digits = rounding.sigDigits ?? 2;
  const magnitude =
    10 ** (Math.floor(Math.log10(Math.abs(value))) - digits + 1);
  return fn(value / magnitude) * magnitude;
}
function compactNumber(value: number): string {
  const units: ReadonlyArray<readonly [number, string]> = [
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'k'],
  ];
  for (const [size, suffix] of units) {
    if (Math.abs(value) >= size) {
      // Floor again at one decimal so 1,250,000 never reads as 1.3M.
      return `${trimZeros((Math.floor((value / size) * 10) / 10).toFixed(1))}${suffix}`;
    }
  }
  return value.toLocaleString('en-US');
}
export function formatProofValue(
  value: number,
  rounding: ProofStatDefinition['display']['rounding']
): string {
  const rounded = roundConservative(value, rounding);
  let text: string;
  if (rounding.percent) {
    text = `${trimZeros((rounded * 100).toFixed(1))}%`;
  } else if (rounding.compact) {
    text = compactNumber(rounded);
  } else {
    text = rounded.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  // "+" only when the rounded figure is strictly below the true value.
  const plus = rounding.suffix === '+' && rounded < value ? '+' : '';
  return `${text}${plus}`;
}
export function isFresh(
  definition: ProofStatDefinition,
  observation: ProofStatObservation,
  now: Date
): boolean {
  const measured = Date.parse(observation.measuredAt);
  if (!Number.isFinite(measured)) return false;
  // A future timestamp is a clock or producer bug, never "fresh".
  if (measured > now.getTime() + 5 * 60 * 1000) return false;
  return now.getTime() - measured <= definition.freshnessSlaHours * HOUR_MS;
}
export interface ResolveOptions {
  readonly now: Date;
  /** Public surfaces pass 'public' so internal stats never render there. */
  readonly surface: 'public' | 'internal';
}
export function resolveProofStat(
  definition: ProofStatDefinition,
  observation: ProofStatObservation | null | undefined,
  { now, surface }: ResolveOptions
): ResolvedProofStat {
  const base = {
    id: definition.id,
    label: definition.label,
    methodology: definition.methodology,
    fallback: definition.fallback,
    measuredAt: observation?.measuredAt ?? null,
    rawValue: observation?.value ?? null,
  };
  const hidden = (state: ProofStatState): ResolvedProofStat => ({
    ...base,
    state,
    value: null,
    sentence: null,
  });
  if (surface === 'public' && definition.visibility !== 'public') {
    return hidden('internal');
  }
  if (definition.status !== 'live' && definition.status !== 'measuring') {
    return hidden('not-live');
  }
  if (!observation || !Number.isFinite(observation.value)) {
    return hidden('missing');
  }
  if (!isFresh(definition, observation, now)) return hidden('stale');
  if (
    definition.threshold !== null &&
    observation.value < definition.threshold
  ) {
    return hidden('below-threshold');
  }
  if (
    definition.ceiling !== undefined &&
    observation.value > definition.ceiling
  ) {
    return hidden('above-ceiling');
  }
  if (
    definition.legalClass !== 'plain' &&
    (!observation.approval?.cardId || !observation.approval.approvedAt)
  ) {
    return hidden('unapproved');
  }
  if (definition.status !== 'live') return hidden('not-live');
  const value = formatProofValue(
    observation.value,
    definition.display.rounding
  );
  return {
    ...base,
    state: 'publishable',
    value,
    sentence: definition.display.sentence.replaceAll('{value}', value),
  };
}
export const STAT_BINDING_PATTERN =
  /\{stat:([a-z][a-z0-9_]{2,63})(?:\.(value|sentence))?\}/gu;
export type BoundCopy =
  | { readonly ok: true; readonly text: string }
  | {
      readonly ok: false;
      readonly fallback: string | null;
      readonly blockedBy: readonly string[];
    };
/** Withhold the whole line if any bound stat is blocked; use its fallback. */
export function renderBoundCopy(
  template: string,
  resolve: (id: string) => ResolvedProofStat | null
): BoundCopy {
  const blocked: string[] = [];
  let fallback: string | null = null;
  const text = template.replace(
    STAT_BINDING_PATTERN,
    (match, id: string, part: string | undefined) => {
      const stat = resolve(id);
      if (!stat || stat.state !== 'publishable') {
        blocked.push(id);
        fallback ??= stat?.fallback ?? null;
        return match;
      }
      return (part === 'sentence' ? stat.sentence : stat.value) ?? match;
    }
  );
  return blocked.length > 0
    ? { ok: false, fallback, blockedBy: blocked }
    : { ok: true, text };
}
export function crossedMilestones(
  milestones: readonly number[],
  previous: number | null,
  next: number
): number[] {
  return milestones.filter(m => (previous ?? 0) < m && next >= m);
}
