import { Card, CardContent } from '@jovie/ui';
import { AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react';

interface DataAvailability {
  isConfigured: boolean;
  isAvailable: boolean;
  errorMessage?: string;
}

interface DefaultStatusBannerProps
  extends Readonly<{
    status: 'alive' | 'dead';
    detail: string;
    runwayMonths: number | null;
    mrrGrowth30dUsd: number;
    /** Stripe data availability status */
    stripeAvailability?: DataAvailability;
    /** Mercury data availability status */
    mercuryAvailability?: DataAvailability;
  }> {}

export function DefaultStatusBanner({
  status,
  detail,
  runwayMonths,
  mrrGrowth30dUsd,
  stripeAvailability,
  mercuryAvailability,
}: DefaultStatusBannerProps) {
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
    statusTone = 'text-slate-500 dark:text-slate-400';
    badgeTone = 'border-slate-500/20 bg-slate-500/10';
    Icon = HelpCircle;
  } else if (isAlive) {
    statusLabel = 'Default Alive';
    statusTone = 'text-emerald-600 dark:text-emerald-300';
    badgeTone = 'border-emerald-500/20 bg-emerald-500/10';
    Icon = CheckCircle2;
  } else {
    statusLabel = 'Default Dead';
    statusTone = 'text-rose-600 dark:text-rose-300';
    badgeTone = 'border-rose-500/20 bg-rose-500/10';
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
      className='border-subtle bg-surface-1'
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
            <p className='text-xs font-semibold uppercase tracking-[0.15em] text-tertiary-token sm:tracking-[0.2em]'>
              Company Health
            </p>
            <p
              className={`text-xl font-semibold sm:text-2xl ${statusTone} break-words`}
            >
              {statusLabel}
            </p>
            <p className='text-sm text-secondary-token'>{detail}</p>
          </div>
        </div>
        <div className='mt-2 flex flex-row justify-between gap-4 border-t border-subtle pt-3 text-sm text-tertiary-token sm:mt-0 sm:flex-col sm:gap-2 sm:border-t-0 sm:pt-0 md:text-right'>
          <span className='font-medium text-primary-token'>{runwayCopy}</span>
          <span className='text-right'>
            <span className='hidden sm:inline'>MRR growth (30d): </span>
            <span className='sm:hidden'>30d: </span>
            {growthLabel}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
