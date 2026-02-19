'use client';

import { cn } from '@/lib/utils';
import type { AudienceReferrer, AudienceUtmParams } from '@/types';

export interface AudienceSourceCellProps {
  readonly referrerHistory: AudienceReferrer[];
  readonly utmParams?: AudienceUtmParams;
  readonly className?: string;
}

const DOMAIN_MAP: Record<string, string> = {
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

/**
 * Extracts a human-readable source label from a referrer URL.
 * Detects known social platforms and falls back to domain name.
 */
function parseSourceLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace('www.', '');
    return DOMAIN_MAP[hostname] ?? hostname;
  } catch {
    return url || 'Direct';
  }
}

/**
 * Build a source label from UTM params (source + medium).
 * Returns null if no meaningful UTM data is available.
 */
function formatUtmSourceLabel(utm: AudienceUtmParams): string | null {
  if (!utm.source) return null;
  const source = utm.source.charAt(0).toUpperCase() + utm.source.slice(1);
  if (utm.medium) return `${source} / ${utm.medium}`;
  return source;
}

export function AudienceSourceCell({
  referrerHistory,
  utmParams,
  className,
}: AudienceSourceCellProps) {
  // Prefer UTM params from the landing page URL
  const utmLabel = utmParams ? formatUtmSourceLabel(utmParams) : null;
  if (utmLabel) {
    return (
      <div className={cn('text-xs text-secondary-token truncate', className)}>
        {utmLabel}
        {utmParams?.campaign && (
          <span className='text-tertiary-token ml-1'>
            ({utmParams.campaign})
          </span>
        )}
      </div>
    );
  }

  // Fall back to referrer-based source
  if (!referrerHistory.length) {
    return (
      <div className={cn('text-xs text-tertiary-token', className)}>Direct</div>
    );
  }

  const latestReferrer = referrerHistory[0];
  const sourceLabel = parseSourceLabel(latestReferrer.url);

  return (
    <div className={cn('text-xs text-secondary-token truncate', className)}>
      {sourceLabel}
    </div>
  );
}
