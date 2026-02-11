'use client';

import React from 'react';
import { Icon } from '@/components/atoms/Icon';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import { cn } from '@/lib/utils';
import { formatTimeAgo } from '@/lib/utils/audience';
import type { AudienceIntentLevel, AudienceMember } from '@/types';

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
  const displayName = member.displayName || 'Visitor';
  const isHighIntent = member.intentLevel === 'high';

  return (
    <button
      type='button'
      className={cn(
        'w-full text-left flex items-start gap-3 px-4 py-3.5 transition-colors duration-150',
        isSelected ? 'bg-surface-2/70' : 'active:bg-surface-2/40',
        isHighIntent && 'font-medium'
      )}
      onClick={() => onTap(member)}
      aria-label={`View details for ${displayName}`}
    >
      {/* Avatar circle with intent dot */}
      <div className='flex-shrink-0 relative mt-0.5'>
        <div
          className='size-9 rounded-full bg-surface-2 flex items-center justify-center'
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
            className='font-semibold text-[15px] leading-tight text-primary-token'
          >
            {displayName}
          </TruncatedText>
          {mode === 'members' && member.lastSeenAt && (
            <span className='flex-shrink-0 text-xs text-tertiary-token tabular-nums'>
              {formatTimeAgo(member.lastSeenAt)}
            </span>
          )}
        </div>

        {mode === 'members' ? (
          <MemberDetails member={member} />
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
function MemberDetails({ member }: { readonly member: AudienceMember }) {
  const isReturning = member.visits > 1;
  const source =
    member.referrerHistory.length > 0
      ? parseSourceForMobile(member.referrerHistory[0].url)
      : 'Direct';
  const lastAction =
    member.latestActions.length > 0 ? member.latestActions[0].label : null;

  return (
    <div className='mt-0.5 space-y-0.5'>
      {/* Intent + Returning badge row */}
      <p className='text-xs flex items-center gap-1.5'>
        <span
          className={cn(
            'inline-block size-1.5 rounded-full',
            INTENT_DOT_STYLES[member.intentLevel]
          )}
          aria-hidden='true'
        />
        <span className={cn('font-medium', INTENT_STYLES[member.intentLevel])}>
          {member.intentLevel.charAt(0).toUpperCase() +
            member.intentLevel.slice(1)}
        </span>
        <DotSeparator />
        {isReturning ? (
          <span className='text-secondary-token font-medium'>Returning</span>
        ) : (
          <span className='text-tertiary-token/70'>New</span>
        )}
        <DotSeparator />
        <span className='text-tertiary-token'>{source}</span>
      </p>

      {/* Last action */}
      {lastAction && (
        <p className='text-[11px] text-tertiary-token truncate'>
          {lastAction}
        </p>
      )}
    </div>
  );
}

function parseSourceForMobile(url: string): string {
  try {
    const parsed = new URL(url);
    const utmSource = parsed.searchParams.get('utm_source');
    if (utmSource) return utmSource;
    const hostname = parsed.hostname.replace('www.', '');
    const domainMap: Record<string, string> = {
      'x.com': 'X',
      'twitter.com': 'X',
      'instagram.com': 'IG',
      'facebook.com': 'FB',
      'tiktok.com': 'TikTok',
      'youtube.com': 'YT',
      't.co': 'X',
    };
    return domainMap[hostname] ?? hostname;
  } catch {
    return url || 'Direct';
  }
}

/** Subtitle lines for subscribers mode */
function SubscriberDetails({ member }: { readonly member: AudienceMember }) {
  return (
    <div className='mt-0.5 space-y-0.5'>
      {member.email && (
        <p className='text-[13px] leading-snug text-secondary-token truncate'>
          {member.email}
        </p>
      )}
      {member.lastSeenAt && (
        <p className='text-xs text-tertiary-token'>
          Subscribed {formatTimeAgo(member.lastSeenAt)}
        </p>
      )}
    </div>
  );
}

/** Tiny dot separator for inline metadata */
function DotSeparator() {
  return (
    <span className='text-quaternary-token select-none' aria-hidden='true'>
      ·
    </span>
  );
}
