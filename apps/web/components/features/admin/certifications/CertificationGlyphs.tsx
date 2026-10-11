import {
  OVIE_CERTIFICATION_STATE_LABELS,
  OVIE_CERTIFICATION_TIER_LABELS,
  type OvieCertificationState,
  type OvieCertificationTier,
  type OvieCertificationTierStatus,
} from '@/lib/ovie/certifications/types';
import { cn } from '@/lib/utils';

/**
 * Linear-style status glyphs for certification state and evidence tiers.
 * Every state has a distinct shape (never color alone); the state name is the
 * accessible label and tooltip, never a visible word in the row.
 */

const STATE_TONE: Record<OvieCertificationState, string> = {
  working: 'text-tertiary-token',
  review_ready: 'text-info',
  founder_locked: 'text-success',
  shipped: 'text-success',
  monitored: 'text-success',
};

function arcPath(fraction: number): string {
  // Pie wedge from 12 o'clock, clockwise, inside a r=3.5 disc centered at 7,7.
  const angle = fraction * 2 * Math.PI;
  const x = 7 + 3.5 * Math.sin(angle);
  const y = 7 - 3.5 * Math.cos(angle);
  const largeArc = fraction > 0.5 ? 1 : 0;
  return `M7 7 L7 3.5 A3.5 3.5 0 ${largeArc} 1 ${x.toFixed(3)} ${y.toFixed(3)} Z`;
}

function CheckMark() {
  return (
    <path
      d='M4.6 7.1 6.3 8.8 9.4 5.4'
      fill='none'
      stroke='var(--color-bg-base)'
      strokeWidth='1.5'
      strokeLinecap='round'
      strokeLinejoin='round'
    />
  );
}

export function CertificationStateGlyph({
  state,
  className,
}: {
  readonly state: OvieCertificationState;
  readonly className?: string;
}) {
  const label = OVIE_CERTIFICATION_STATE_LABELS[state];
  return (
    <svg
      viewBox='0 0 14 14'
      role='img'
      aria-label={label}
      data-state={state}
      data-testid='certification-state-glyph'
      className={cn('h-3.5 w-3.5 shrink-0', STATE_TONE[state], className)}
    >
      <title>{label}</title>
      {state === 'working' || state === 'review_ready' ? (
        <>
          <circle
            cx='7'
            cy='7'
            r='5.5'
            fill='none'
            stroke='currentColor'
            strokeWidth='1.5'
          />
          <path
            d={arcPath(state === 'working' ? 0.5 : 0.75)}
            fill='currentColor'
          />
        </>
      ) : null}
      {state === 'founder_locked' ? (
        <>
          <circle
            cx='7'
            cy='7'
            r='5.5'
            fill='none'
            stroke='currentColor'
            strokeWidth='1.5'
          />
          <path
            d='M4.6 7.1 6.3 8.8 9.4 5.4'
            fill='none'
            stroke='currentColor'
            strokeWidth='1.5'
            strokeLinecap='round'
            strokeLinejoin='round'
          />
        </>
      ) : null}
      {state === 'shipped' || state === 'monitored' ? (
        <>
          <circle
            cx='7'
            cy='7'
            r={state === 'monitored' ? 4.75 : 6.25}
            fill='currentColor'
          />
          {state === 'monitored' ? (
            <circle
              cx='7'
              cy='7'
              r='6.4'
              fill='none'
              stroke='currentColor'
              strokeWidth='0.9'
            />
          ) : null}
          <CheckMark />
        </>
      ) : null}
    </svg>
  );
}

const TIER_TONE: Record<OvieCertificationTierStatus, string> = {
  passed: 'text-success',
  failed: 'text-destructive',
  pending: 'text-warning',
  missing: 'text-quaternary-token',
};

const TIER_STATUS_LABEL: Record<OvieCertificationTierStatus, string> = {
  passed: 'Passed',
  failed: 'Failed',
  pending: 'Pending',
  missing: 'Missing',
};

export function certificationTierLabel(
  tier: OvieCertificationTier,
  status: OvieCertificationTierStatus
): string {
  return `${OVIE_CERTIFICATION_TIER_LABELS[tier]}: ${TIER_STATUS_LABEL[status]}`;
}

/** 10px evidence glyph: filled = passed, x = failed, half = pending, dashed = missing. */
export function CertificationTierGlyph({
  tier,
  status,
  className,
}: {
  readonly tier: OvieCertificationTier;
  readonly status: OvieCertificationTierStatus;
  readonly className?: string;
}) {
  const label = certificationTierLabel(tier, status);
  return (
    <svg
      viewBox='0 0 10 10'
      role='img'
      aria-label={label}
      data-tier={tier}
      data-status={status}
      className={cn('h-2.5 w-2.5 shrink-0', TIER_TONE[status], className)}
    >
      <title>{label}</title>
      {status === 'passed' ? (
        <circle cx='5' cy='5' r='4' fill='currentColor' />
      ) : null}
      {status === 'failed' ? (
        <>
          <circle cx='5' cy='5' r='4' fill='currentColor' />
          <path
            d='M3.5 3.5 6.5 6.5 M6.5 3.5 3.5 6.5'
            stroke='var(--color-bg-base)'
            strokeWidth='1.2'
            strokeLinecap='round'
          />
        </>
      ) : null}
      {status === 'pending' ? (
        <>
          <circle
            cx='5'
            cy='5'
            r='3.5'
            fill='none'
            stroke='currentColor'
            strokeWidth='1'
          />
          <path d='M5 1.5 A3.5 3.5 0 0 1 5 8.5 Z' fill='currentColor' />
        </>
      ) : null}
      {status === 'missing' ? (
        <circle
          cx='5'
          cy='5'
          r='3.5'
          fill='none'
          stroke='currentColor'
          strokeWidth='1'
          strokeDasharray='1.6 1.4'
        />
      ) : null}
    </svg>
  );
}
