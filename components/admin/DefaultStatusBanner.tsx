import { Card, CardContent } from '@jovie/ui';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

interface DefaultStatusBannerProps {
  status: 'alive' | 'dead';
  detail: string;
  runwayMonths: number | null;
  mrrGrowth30dUsd: number;
}

export function DefaultStatusBanner({
  status,
  detail,
  runwayMonths,
  mrrGrowth30dUsd,
}: DefaultStatusBannerProps) {
  const isAlive = status === 'alive';
  const statusLabel = isAlive ? 'Default Alive' : 'Default Dead';
  const statusTone = isAlive
    ? 'text-emerald-600 dark:text-emerald-300'
    : 'text-rose-600 dark:text-rose-300';
  const badgeTone = isAlive
    ? 'border-emerald-500/20 bg-emerald-500/10'
    : 'border-rose-500/20 bg-rose-500/10';
  const Icon = isAlive ? CheckCircle2 : AlertTriangle;

  const runwayLabel = runwayMonths == null ? '∞' : runwayMonths.toFixed(1);
  const runwayCopy =
    runwayMonths == null
      ? 'Runway: unlimited at current burn'
      : `Runway: ${runwayLabel} months`;

  const growthLabel = mrrGrowth30dUsd.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

  return (
    <Card
      className='border-subtle bg-surface-1'
      data-testid='default-status-banner'
    >
      <CardContent className='flex flex-col gap-4 md:flex-row md:items-center md:justify-between'>
        <div className='flex items-start gap-3'>
          <div
            className={`rounded-full border ${badgeTone} p-2`}
            aria-hidden='true'
          >
            <Icon className={`size-4 ${statusTone}`} />
          </div>
          <div className='space-y-1'>
            <p className='text-xs font-semibold uppercase tracking-[0.2em] text-tertiary-token'>
              Paul Graham default status
            </p>
            <p className={`text-2xl font-semibold ${statusTone}`}>
              {statusLabel}
            </p>
            <p className='text-sm text-secondary-token'>{detail}</p>
          </div>
        </div>
        <div className='flex flex-col gap-2 text-sm text-tertiary-token md:text-right'>
          <span className='font-medium text-primary-token'>{runwayCopy}</span>
          <span>MRR growth (30d): {growthLabel}</span>
        </div>
      </CardContent>
    </Card>
  );
}
