import { HOME_LOOP_NOT_MEASURED } from '@/lib/home-loop/contract';

/** Calm copy when founder metrics are still resolving — never per-tile Unknown. */
export const OVIE_METRICS_SYNCING_NOTICE = 'Some signals are still syncing.';

const UNMEASURED_VALUES = new Set([
  'Unknown',
  'Not measured',
  'Not Measured',
  '—',
  HOME_LOOP_NOT_MEASURED,
]);

export function isUnmeasuredDisplayValue(value: string): boolean {
  return UNMEASURED_VALUES.has(value.trim());
}

export function hasKnownMetricText(
  text: string | null | undefined
): text is string {
  return text !== null && text !== undefined && text.length > 0;
}

/** Founder shipping header: never show the literal "Unknown". */
export function shippingTruthHeaderLabel(
  input: {
    readonly truth: string;
    readonly connection: string;
  } | null,
  isPending: boolean
): string {
  if (isPending || !input || input.truth === 'unknown') return 'Syncing';
  if (input.truth === 'stale' && input.connection !== 'connected') {
    return 'Disconnected';
  }
  const labels: Record<string, string> = {
    fresh: 'Fresh',
    stale: 'Connected Stale',
    disconnected: 'Disconnected',
    unavailable: 'Unavailable',
    unauthorized: 'Unauthorized',
    degraded: 'Degraded',
    failure: 'Error',
    recovery: 'Recovery',
  };
  return labels[input.truth] ?? 'Syncing';
}
