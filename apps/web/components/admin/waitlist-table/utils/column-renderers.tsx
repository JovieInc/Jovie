import { Badge } from '@jovie/ui';
import { ShoppingBag, Ticket, TrendingUp } from 'lucide-react';
import { StatusBadge } from '@/components/atoms/StatusBadge';
import { PlatformPill } from '@/components/dashboard/atoms/PlatformPill';
import type { WaitlistEntryRow } from '@/lib/admin/waitlist';
import { PLATFORM_LABELS, PRIMARY_GOAL_LABELS } from '../constants';

/**
 * Renders the primary goal cell with appropriate icon and badge
 */
export function renderPrimaryGoalCell(value: string | null) {
  const primaryGoalLabel = value ? (PRIMARY_GOAL_LABELS[value] ?? value) : null;

  // Icon mapping for primary goals
  const GOAL_ICONS: Record<string, typeof TrendingUp> = {
    streams: TrendingUp,
    merch: ShoppingBag,
    tickets: Ticket,
  };
  const GoalIcon = value ? (GOAL_ICONS[value] ?? null) : null;

  return primaryGoalLabel ? (
    <Badge size='sm' variant='secondary' className='gap-1'>
      {GoalIcon && <GoalIcon className='h-3 w-3' />}
      {primaryGoalLabel}
    </Badge>
  ) : (
    <span className='text-tertiary-token'>—</span>
  );
}

/**
 * Extracts username from a social media URL
 */
function extractUsername(url: string): string {
  const urlWithoutProtocol = url.replace(/^https?:\/\//, '');
  return urlWithoutProtocol.split('/').pop() || urlWithoutProtocol;
}

/**
 * Renders the primary social platform cell
 */
export function renderPrimarySocialCell(entry: WaitlistEntryRow) {
  const platformLabel =
    PLATFORM_LABELS[entry.primarySocialPlatform] ?? entry.primarySocialPlatform;
  const username = extractUsername(entry.primarySocialUrlNormalized);

  return (
    <PlatformPill
      platformIcon={entry.primarySocialPlatform.toLowerCase()}
      platformName={platformLabel}
      primaryText={`@${username}`}
      onClick={() => window.open(entry.primarySocialUrlNormalized, '_blank')}
    />
  );
}

/**
 * Renders the Spotify platform cell
 */
export function renderSpotifyCell(spotifyUrl: string | null) {
  if (!spotifyUrl) {
    return <span className='text-tertiary-token'>—</span>;
  }

  const artistName = extractUsername(spotifyUrl) || 'Spotify';

  return (
    <PlatformPill
      platformIcon='spotify'
      platformName='Spotify'
      primaryText={`@${artistName}`}
      onClick={() => window.open(spotifyUrl, '_blank')}
    />
  );
}

/**
 * Renders the "Heard About" cell with proper label
 */
export function renderHeardAboutCell(value: string | null) {
  if (!value) {
    return <span className='text-tertiary-token'>—</span>;
  }

  const heardAboutLabels: Record<string, string> = {
    socialmedia: 'Social Media',
    friend: 'Friend',
    search: 'Search',
    other: 'Other',
  };

  const label = heardAboutLabels[value] ?? value;

  return (
    <span className='text-xs text-secondary-token whitespace-nowrap'>
      {label}
    </span>
  );
}

/**
 * Renders the status badge cell
 */
export function renderStatusCell(status: WaitlistEntryRow['status']) {
  const statusLabels: Record<WaitlistEntryRow['status'], string> = {
    new: 'New',
    invited: 'Invited',
    claimed: 'Claimed',
  };

  const statusVariants: Record<
    WaitlistEntryRow['status'],
    'blue' | 'green' | 'purple' | 'orange' | 'red' | 'gray'
  > = {
    new: 'blue',
    invited: 'orange',
    claimed: 'green',
  };

  return (
    <StatusBadge variant={statusVariants[status]}>
      {statusLabels[status]}
    </StatusBadge>
  );
}
