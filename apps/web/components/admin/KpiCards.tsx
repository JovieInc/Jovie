import {
  AlertTriangle,
  Banknote,
  CircleDollarSign,
  TrendingDown,
  Users,
} from 'lucide-react';
import { KpiItem } from './KpiItem';

interface DataAvailability {
  readonly isConfigured: boolean;
  readonly isAvailable: boolean;
  readonly errorMessage?: string;
}

interface KpiCardsProps {
  readonly mrrUsd: number;
  readonly balanceUsd: number;
  readonly burnRateUsd: number;
  readonly claimedCreators: number;
  /** Stripe data availability status */
  readonly stripeAvailability?: DataAvailability;
  /** Mercury data availability status */
  readonly mercuryAvailability?: DataAvailability;
}

function UnavailableBadge({ message }: Readonly<{ message?: string }>) {
  return (
    <span
      className='inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400 line-clamp-1'
      title={message ?? 'Data source unavailable'}
    >
      <AlertTriangle className='size-3' aria-hidden='true' />
      <span className='hidden sm:inline'>Unavailable</span>
      <span className='sm:hidden'>N/A</span>
    </span>
  );
}

function NotConfiguredBadge({ message }: Readonly<{ message?: string }>) {
  return (
    <span
      className='inline-flex items-center gap-1 rounded-full bg-slate-500/10 px-2 py-0.5 text-xs font-medium text-slate-500 dark:text-slate-400 line-clamp-1'
      title={message ?? 'Data source not configured'}
    >
      <span className='hidden sm:inline'>Not configured</span>
      <span className='sm:hidden'>N/A</span>
    </span>
  );
}

export function KpiCards({
  mrrUsd,
  balanceUsd,
  burnRateUsd,
  claimedCreators,
  stripeAvailability,
  mercuryAvailability,
}: Readonly<KpiCardsProps>) {
  const formatUsd = (value: number) =>
    value.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: value >= 1000 ? 0 : 2,
    });

  const stripeIsAvailable = stripeAvailability?.isAvailable !== false;
  const stripeIsConfigured = stripeAvailability?.isConfigured !== false;

  const mercuryIsAvailable = mercuryAvailability?.isAvailable !== false;
  const mercuryIsConfigured = mercuryAvailability?.isConfigured !== false;

  const mrrLabel =
    stripeIsConfigured && stripeIsAvailable ? formatUsd(mrrUsd) : '—';

  const balanceLabel =
    mercuryIsConfigured && mercuryIsAvailable ? formatUsd(balanceUsd) : '—';
  const burnRateLabel =
    mercuryIsConfigured && mercuryIsAvailable ? formatUsd(burnRateUsd) : '—';

  const claimedCreatorsLabel = claimedCreators.toLocaleString('en-US');

  const renderStripeMetadata = (text: string) => {
    if (!stripeIsConfigured) {
      return <NotConfiguredBadge message={stripeAvailability?.errorMessage} />;
    }
    if (!stripeIsAvailable) {
      return <UnavailableBadge message={stripeAvailability?.errorMessage} />;
    }
    return text;
  };

  const renderMercuryMetadata = (text: string) => {
    if (!mercuryIsConfigured) {
      return <NotConfiguredBadge message={mercuryAvailability?.errorMessage} />;
    }
    if (!mercuryIsAvailable) {
      return <UnavailableBadge message={mercuryAvailability?.errorMessage} />;
    }
    return text;
  };

  return (
    <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
      <KpiItem
        title='MRR'
        value={mrrLabel}
        metadata={renderStripeMetadata('Monthly recurring revenue')}
        icon={CircleDollarSign}
        iconClassName='text-sky-600 dark:text-sky-400'
      />

      <KpiItem
        title='Balance'
        value={balanceLabel}
        metadata={renderMercuryMetadata('Mercury checking')}
        icon={Banknote}
        iconClassName='text-emerald-600 dark:text-emerald-400'
      />

      <KpiItem
        title='Burn rate'
        value={burnRateLabel}
        metadata={renderMercuryMetadata('Spend in the last 30 days')}
        icon={TrendingDown}
        iconClassName='text-rose-500 dark:text-rose-300'
      />

      <KpiItem
        title='Claimed creators'
        value={claimedCreatorsLabel}
        metadata='Artists who claimed their profile'
        icon={Users}
        iconClassName='text-violet-500 dark:text-violet-300'
      />
    </div>
  );
}
