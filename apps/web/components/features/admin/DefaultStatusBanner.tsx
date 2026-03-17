import { Card, CardContent } from '@jovie/ui';
import { AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react';

interface DataAvailability {
  readonly isConfigured: boolean;
  readonly isAvailable: boolean;
  readonly errorMessage?: string;
}

interface DefaultStatusBannerProps
  extends Readonly<{
    readonly status: 'alive' | 'dead';
    readonly detail: string;
    readonly runwayMonths: number | null;
    readonly mrrGrowth30dUsd: number;
    /** Stripe data availability status */
    readonly stripeAvailability?: DataAvailability;
    /** Mercury data availability status */
    readonly mercuryAvailability?: DataAvailability;
  }> {}

export function DefaultStatusBanner({
  status,
  detail,
  runwayMonths,
  mrrGrowth30dUsd,
  stripeAvailability,
  mercuryAvailability,
}: Readonly<DefaultStatusBannerProps>) {
  // Determine if we can actually show a meaningful status
  const canCalculateStatus =
    stripeAvailability?.isAvailable !== false &&
    mercuryAvailability?.isAvailable !== false;

  const isAlive = status === 'alive';
  const isUnavailable = !canCalculateStatus;

  // Determine visual styling based on status
  let statusLabel: string;
  let statusTone: string;
  let badgeTone: string;
  let Icon: typeof CheckCircle2;

  if (isUnavailable) {
    statusLabel = 'Status Unavailable';
    statusTone = 'text-(--linear-text-tertiary)';
    badgeTone = 'border-(--linear-border-default) bg-(--linear-bg-surface-2)';
    Icon = HelpCircle;
  } else if (isAlive) {
    statusLabel = 'Default Alive';
    statusTone = 'text-success';
    badgeTone = 'border-success/20 bg-success/10';
    Icon = CheckCircle2;
  } else {
    statusLabel = 'Default Dead';
    statusTone = 'text-error';
    badgeTone = 'border-error/20 bg-error/10';
    Icon = AlertTriangle;
  }

  // Runway display
  const runwayLabel =
    isUnavailable || runwayMonths === null ? null : runwayMonths.toFixed(1);
  const getRunwayCopy = (): string => {
    if (isUnavailable) return 'Runway: —';
    if (runwayMonths == null) return 'Runway: unlimited at current burn';
    return `Runway: ${runwayLabel} months`;
  };
  const runwayCopy = getRunwayCopy();

  // MRR growth display
  const growthLabel = isUnavailable
    ? '—'
    : mrrGrowth30dUsd.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      });

  return (
    <Card
      className='border-(--linear-border-default) bg-(--linear-bg-surface-1)'
      data-testid='default-status-banner'
    >
      <CardContent className='flex flex-col gap-4 p-4 sm:p-6 md:flex-row md:items-center md:justify-between'>
        <div className='flex items-start gap-3'>
          <div
            className={`shrink-0 rounded-full border ${badgeTone} p-2`}
            aria-hidden='true'
          >
            <Icon className={`size-4 ${statusTone}`} />
          </div>
          <div className='min-w-0 space-y-1'>
            <p className='text-xs font-semibold uppercase tracking-[0.15em] text-(--linear-text-tertiary) sm:tracking-[0.2em]'>
              Company Health
            </p>
            <p
              className={`text-xl font-semibold sm:text-2xl ${statusTone} break-words`}
            >
              {statusLabel}
            </p>
            <p className='text-sm text-(--linear-text-secondary)'>{detail}</p>
          </div>
        </div>
        <div className='mt-2 flex flex-row justify-between gap-4 border-t border-(--linear-border-default) pt-3 text-sm text-(--linear-text-tertiary) sm:mt-0 sm:flex-col sm:gap-2 sm:border-t-0 sm:pt-0 md:text-right'>
          <span className='font-medium text-(--linear-text-primary) tabular-nums'>
            {runwayCopy}
          </span>
          <span className='text-right tabular-nums'>
            <span className='hidden sm:inline'>MRR growth (30d): </span>
            <span className='sm:hidden'>30d: </span>
            {growthLabel}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
