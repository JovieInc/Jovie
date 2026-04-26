'use client';

import React from 'react';
import { Icon } from '@/components/atoms/Icon';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import { cn } from '@/lib/utils';
import { formatTimeAgo, getFallbackName } from '@/lib/utils/audience';
import { calculateLtv } from '@/lib/utils/ltv';
import { capitalizeFirst } from '@/lib/utils/string-utils';
import type { AudienceIntentLevel, AudienceMember } from '@/types';
import { formatDollars } from './AudienceLtvCell';

export interface AudienceMobileCardProps {
  readonly member: AudienceMember;
  readonly mode: 'members' | 'subscribers';
  readonly isSelected?: boolean;
  readonly onTap: (member: AudienceMember) => void;
}

const INTENT_STYLES: Record<AudienceIntentLevel, string> = {
  high: 'text-emerald-600 dark:text-emerald-400',
  medium: 'text-amber-600 dark:text-amber-400',
  low: 'text-tertiary-token',
};

const INTENT_DOT_STYLES: Record<AudienceIntentLevel, string> = {
  high: 'bg-emerald-500',
  medium: 'bg-amber-400',
  low: 'bg-zinc-400',
};

const MOBILE_SOURCE_MAP: Record<string, string> = {
  'x.com': 'X',
  'twitter.com': 'X',
  'instagram.com': 'Instagram',
  'facebook.com': 'Facebook',
  'tiktok.com': 'TikTok',
  'youtube.com': 'YouTube',
  'spotify.com': 'Spotify',
  'google.com': 'Google',
  'reddit.com': 'Reddit',
  'linkedin.com': 'LinkedIn',
  't.co': 'X',
  'l.facebook.com': 'Facebook',
  'l.instagram.com': 'Instagram',
};

const INTERNAL_HOST_SUFFIXES = ['jov.ie', 'jovie.fm'];

function normalizeSourceLabel(source: string): string {
  const normalized = source.trim().toLowerCase();
  return (
    MOBILE_SOURCE_MAP[normalized] ??
    normalized.charAt(0).toUpperCase() + normalized.slice(1)
  );
}

function isInternalReferrer(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace('www.', '').toLowerCase();
    return INTERNAL_HOST_SUFFIXES.some(
      suffix => hostname === suffix || hostname.endsWith(`.${suffix}`)
    );
  } catch {
    return false;
  }
}

/**
 * AudienceMobileCard - Clean, Apple-esque card for audience members on mobile.
 *
 * Uses avatar anchoring, clear typographic hierarchy, and inline metadata.
 * Memoized to prevent unnecessary re-renders in the mobile list.
 */
export const AudienceMobileCard = React.memo(function AudienceMobileCard({
  member,
  mode,
  isSelected,
  onTap,
}: AudienceMobileCardProps) {
  const displayName = member.displayName || getFallbackName(member.type);
  const isHighIntent = member.intentLevel === 'high';

  // Calculate LTV for value accent
  const ltvBreakdown = calculateLtv({
    tipAmountTotalCents: member.tipAmountTotalCents,
    tipCount: member.tipCount,
    visits: member.visits,
    engagementScore: member.engagementScore,
    streamingClicks: member.ltvStreamingClicks ?? 0,
    tipClickValueCents: member.ltvTipClickValueCents ?? 0,
    merchSalesCents: member.ltvMerchSalesCents ?? 0,
    ticketSalesCents: member.ltvTicketSalesCents ?? 0,
  });
  const hasValue = ltvBreakdown.tier !== 'none';

  return (
    <button
      type='button'
      className={cn(
        'flex w-full items-start gap-3 px-4 py-3.5 text-left transition-[background-color,color] duration-150',
        isSelected ? 'bg-surface-0' : 'active:bg-surface-0',
        isHighIntent && 'font-caption',
        hasValue && 'border-l-2 border-l-emerald-500/20'
      )}
      onClick={() => onTap(member)}
      aria-label={`View details for ${displayName}`}
    >
      {/* Avatar circle with intent dot */}
      <div className='flex-shrink-0 relative mt-0.5'>
        <div
          className='flex size-9 items-center justify-center rounded-full bg-surface-0'
          aria-hidden='true'
        >
          <Icon name='User' className='size-4 text-tertiary-token' />
        </div>
        <span
          className={cn(
            'absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-white dark:border-zinc-900',
            INTENT_DOT_STYLES[member.intentLevel]
          )}
          aria-hidden='true'
        />
      </div>

      {/* Content */}
      <div className='flex-1 min-w-0'>
        {/* Row 1: Name + Time */}
        <div className='flex items-baseline justify-between gap-2'>
          <TruncatedText
            lines={1}
            className='text-mid font-semibold leading-tight text-primary-token'
          >
            {displayName}
          </TruncatedText>
          {mode === 'members' && member.lastSeenAt && (
            <span className='flex-shrink-0 text-2xs text-tertiary-token tabular-nums'>
              {formatTimeAgo(member.lastSeenAt)}
            </span>
          )}
        </div>

        {mode === 'members' ? (
          <MemberDetails
            member={member}
            hasValue={hasValue}
            ltvCents={ltvBreakdown.totalValueCents}
          />
        ) : (
          <SubscriberDetails member={member} />
        )}
      </div>

      {/* Chevron */}
      <div className='flex-shrink-0 self-center'>
        <Icon
          name='ChevronRight'
          className='size-4 text-quaternary-token'
          aria-hidden='true'
        />
      </div>
    </button>
  );
});

/** Subtitle lines for members mode */
function MemberDetails({
  member,
  hasValue,
  ltvCents,
}: {
  readonly member: AudienceMember;
  readonly hasValue: boolean;
  readonly ltvCents: number;
}) {
  const isReturning = member.visits > 1;
  const utmSource = member.utmParams?.source;
  let source = 'Direct';
  if (utmSource) {
    source = normalizeSourceLabel(utmSource);
  } else if (member.referrerHistory.length > 0) {
    const externalReferrer = member.referrerHistory.find(
      entry => !isInternalReferrer(entry.url)
    );
    source = externalReferrer
      ? parseSourceForMobile(externalReferrer.url)
      : 'Direct';
  }

  // City only (no country) for mobile density
  const city = member.geoCity ?? null;

  const lastAction =
    member.latestActions.length > 0
      ? capitalizeFirst(member.latestActions[0].label)
      : null;

  return (
    <div className='mt-0.5 space-y-0.5'>
      {/* Row 2: Intent + Returning + Source + City */}
      <p className='text-2xs flex items-center gap-1.5 min-w-0'>
        <span
          className={cn(
            'inline-block size-1.5 rounded-full shrink-0',
            INTENT_DOT_STYLES[member.intentLevel]
          )}
          aria-hidden='true'
        />
        <span
          className={cn(
            'font-caption shrink-0',
            INTENT_STYLES[member.intentLevel]
          )}
        >
          {capitalizeFirst(member.intentLevel)}
        </span>
        <DotSeparator />
        {isReturning ? (
          <span className='font-caption text-secondary-token shrink-0'>
            Returning
          </span>
        ) : (
          <span className='text-tertiary-token shrink-0'>New</span>
        )}
        <DotSeparator />
        <span className='text-tertiary-token truncate'>{source}</span>
        {city && (
          <>
            <DotSeparator />
            <span className='text-tertiary-token truncate'>{city}</span>
          </>
        )}
      </p>

      {/* Row 3: Last action + LTV value */}
      {(lastAction || hasValue) && (
        <p className='text-2xs flex items-center gap-1.5 min-w-0'>
          {lastAction && (
            <span className='truncate text-tertiary-token'>{lastAction}</span>
          )}
          {lastAction && hasValue && <DotSeparator />}
          {hasValue && (
            <span className='shrink-0 font-caption text-emerald-600 dark:text-emerald-400'>
              {formatDollars(ltvCents)}
            </span>
          )}
        </p>
      )}
    </div>
  );
}

function parseSourceForMobile(url: string): string {
  try {
    const parsed = new URL(url);
    const utmSource = parsed.searchParams.get('utm_source');
    if (utmSource) return normalizeSourceLabel(utmSource);
    const hostname = parsed.hostname.replace('www.', '').toLowerCase();
    return MOBILE_SOURCE_MAP[hostname] ?? hostname;
  } catch {
    return url || 'Direct';
  }
}

/** Subtitle lines for subscribers mode */
function SubscriberDetails({ member }: { readonly member: AudienceMember }) {
  const subscriberLabel =
    member.type === 'email' ? 'Email Subscriber' : 'SMS Subscriber';
  return (
    <div className='mt-0.5 space-y-0.5'>
      {(member.email || member.phone) && (
        <p className='truncate text-app leading-snug text-secondary-token'>
          {subscriberLabel}
        </p>
      )}
      {member.lastSeenAt && (
        <p className='text-2xs text-tertiary-token'>
          Subscribed {formatTimeAgo(member.lastSeenAt)}
        </p>
      )}
    </div>
  );
}

/** Tiny dot separator for inline metadata */
function DotSeparator() {
  return (
    <span
      className='select-none text-quaternary-token shrink-0'
      aria-hidden='true'
    >
      ·
    </span>
  );
}
