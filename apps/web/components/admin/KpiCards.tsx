import {
  AlertTriangle,
  Banknote,
  CircleDollarSign,
  ClipboardList,
  Clock,
  TrendingDown,
  Users,
} from 'lucide-react';
import { KpiItem } from './KpiItem';

interface DataAvailability {
  isConfigured: boolean;
  isAvailable: boolean;
  errorMessage?: string;
}

interface KpiCardsProps {
  mrrUsd: number;
  balanceUsd: number;
  burnRateUsd: number;
  runwayMonths: number | null;
  waitlistCount: number;
  activeSubscribers: number;
  /** Stripe data availability status */
  stripeAvailability?: DataAvailability;
  /** Mercury data availability status */
  mercuryAvailability?: DataAvailability;
}

function UnavailableBadge({ message }: { message?: string }) {
  return (
    <span
      className='inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400'
      title={message ?? 'Data source unavailable'}
    >
      <AlertTriangle className='size-3' aria-hidden='true' />
      <span className='hidden sm:inline'>Unavailable</span>
      <span className='sm:hidden'>N/A</span>
    </span>
  );
}

function NotConfiguredBadge({ message }: { message?: string }) {
  return (
    <span
      className='inline-flex items-center gap-1 rounded-full bg-slate-500/10 px-2 py-0.5 text-xs font-medium text-slate-500 dark:text-slate-400'
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
  runwayMonths,
  waitlistCount,
  activeSubscribers,
  stripeAvailability,
  mercuryAvailability,
}: KpiCardsProps) {
  const formatUsd = (value: number) =>
    value.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: value >= 1000 ? 0 : 2,
    });

  // Determine if Stripe data is available
  const stripeIsAvailable = stripeAvailability?.isAvailable !== false;
  const stripeIsConfigured = stripeAvailability?.isConfigured !== false;

  // Determine if Mercury data is available
  const mercuryIsAvailable = mercuryAvailability?.isAvailable !== false;
  const mercuryIsConfigured = mercuryAvailability?.isConfigured !== false;

  // Format values or show N/A for unavailable sources
  const mrrLabel =
    stripeIsConfigured && stripeIsAvailable ? formatUsd(mrrUsd) : '—';
  const subscribersLabel =
    stripeIsConfigured && stripeIsAvailable
      ? activeSubscribers.toLocaleString('en-US')
      : '—';

  const balanceLabel =
    mercuryIsConfigured && mercuryIsAvailable ? formatUsd(balanceUsd) : '—';
  const burnRateLabel =
    mercuryIsConfigured && mercuryIsAvailable ? formatUsd(burnRateUsd) : '—';

  // Runway depends on both Mercury and Stripe data
  const canCalculateRunway =
    stripeIsConfigured &&
    stripeIsAvailable &&
    mercuryIsConfigured &&
    mercuryIsAvailable;
  const runwayLabel = canCalculateRunway
    ? runwayMonths == null
      ? '∞ mo'
      : `${runwayMonths.toFixed(1)} mo`
    : '—';
  const runwayMetadata = canCalculateRunway
    ? runwayMonths == null
      ? 'Profitable at the current run rate'
      : 'Estimated months of runway'
    : 'Requires Stripe and Mercury data';

  const waitlistLabel = waitlistCount.toLocaleString('en-US');

  // Helper to render metadata with availability badge
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

  const renderRunwayMetadata = () => {
    if (!stripeIsConfigured || !mercuryIsConfigured) {
      return <NotConfiguredBadge message='Requires Stripe and Mercury' />;
    }
    if (!stripeIsAvailable || !mercuryIsAvailable) {
      return <UnavailableBadge message='Requires Stripe and Mercury data' />;
    }
    return runwayMetadata;
  };

  return (
    <div className='space-y-0 divide-y divide-subtle'>
      <KpiItem
        title='MRR'
        value={mrrLabel}
        metadata={renderStripeMetadata('Monthly recurring revenue')}
        icon={CircleDollarSign}
        iconClassName='text-sky-600 dark:text-sky-400'
        iconChipClassName='bg-sky-500/10 dark:bg-sky-500/15'
      />

      <KpiItem
        title='Balance'
        value={balanceLabel}
        metadata={renderMercuryMetadata('Mercury checking')}
        icon={Banknote}
        iconClassName='text-emerald-600 dark:text-emerald-400'
        iconChipClassName='bg-emerald-500/10 dark:bg-emerald-500/15'
      />

      <KpiItem
        title='Burn rate'
        value={burnRateLabel}
        metadata={renderMercuryMetadata('Spend in the last 30 days')}
        icon={TrendingDown}
        iconClassName='text-rose-500 dark:text-rose-300'
        iconChipClassName='bg-rose-500/10 dark:bg-rose-500/15'
      />

      <KpiItem
        title='Runway'
        value={runwayLabel}
        metadata={renderRunwayMetadata()}
        icon={Clock}
        iconClassName='text-amber-500 dark:text-amber-300'
        iconChipClassName='bg-amber-500/10 dark:bg-amber-500/15'
      />

      <KpiItem
        title='Waitlist'
        value={waitlistLabel}
        metadata='Future customers on deck'
        icon={ClipboardList}
        iconClassName='text-indigo-500 dark:text-indigo-300'
        iconChipClassName='bg-indigo-500/10 dark:bg-indigo-500/15'
      />

      <KpiItem
        title='Active subs'
        value={subscribersLabel}
        metadata={renderStripeMetadata('Paying customers this month')}
        icon={Users}
        iconClassName='text-purple-500 dark:text-purple-300'
        iconChipClassName='bg-purple-500/10 dark:bg-purple-500/15'
      />
    </div>
  );
}
