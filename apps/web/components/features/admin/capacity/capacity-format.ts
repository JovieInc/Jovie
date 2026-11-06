import type {
  CreditVerdict,
  Freshness,
  PaceVerdict,
} from '../../../../../../scripts/lib/capacity-registry.mjs';

export type Tone = 'success' | 'warning' | 'danger' | 'neutral';

export function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'Unknown';
  const digits = Math.abs(value) >= 1000 || Number.isInteger(value) ? 0 : 2;
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined
    ? 'Unknown'
    : `${Math.round(value)}%`;
}

/** "in 5d 16h", "in 3h 20m", "passed". Empty input is Unknown, never zero. */
export function formatUntil(
  iso: string | null | undefined,
  now: number
): string {
  if (!iso) return 'Unknown';
  const ms = Date.parse(iso) - now;
  if (Number.isNaN(ms)) return 'Unknown';
  if (ms <= 0) return 'passed';
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 48) return `in ${Math.floor(hours / 24)}d ${hours % 24}h`;
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return hours > 0 ? `in ${hours}h ${minutes}m` : `in ${minutes}m`;
}

export function formatAge(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return 'never read';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m ago`;
  if (hours < 48) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export const PACE_COPY: Record<
  PaceVerdict,
  { tone: Tone; text: (delta: number | null) => string }
> = {
  'under-burning': {
    tone: 'warning',
    text: delta =>
      `Under pace by ${Math.abs(Math.round(delta ?? 0))} pts: route more work here before reset`,
  },
  'on-pace': { tone: 'success', text: () => 'On pace' },
  'over-burning': {
    tone: 'danger',
    text: delta =>
      `Ahead of pace by ${Math.round(delta ?? 0)} pts: will run dry before reset`,
  },
  'reset-passed': {
    tone: 'neutral',
    text: () => 'Window reset since this reading: re-read',
  },
  unconfirmed: {
    tone: 'neutral',
    text: () => 'Percent semantics not confirmed',
  },
  unknown: { tone: 'neutral', text: () => 'No pace: reset or window unknown' },
};

export const CREDIT_COPY: Record<CreditVerdict, { tone: Tone; text: string }> =
  {
    'exhausts-before-expiry': {
      tone: 'danger',
      text: 'Burn exceeds the pace that lasts to expiry',
    },
    'unspent-at-expiry': {
      tone: 'warning',
      text: 'Burn is below pace: credits expire unspent',
    },
    'on-pace': {
      tone: 'success',
      text: 'On pace to use the credits by expiry',
    },
    unknown: { tone: 'neutral', text: 'No burn rate recorded' },
  };

export const FRESHNESS_TONE: Record<Freshness, Tone> = {
  fresh: 'success',
  stale: 'warning',
  unknown: 'neutral',
};

export const USAGE_MODEL_LABEL: Record<string, string> = {
  'uncapped-own-model': 'Uncapped own model',
  'capped-quota': 'Capped quota',
  'subscription-pool': 'Subscription pool',
  credits: 'Credits',
  'pay-per-token': 'Pay per token',
  free: 'Free',
};
