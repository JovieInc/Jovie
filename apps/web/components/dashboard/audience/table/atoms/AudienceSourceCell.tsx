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

const INTERNAL_HOST_SUFFIXES = ['jov.ie', 'jovie.fm'];

function normalizeSourceName(rawSource: string): string {
  const normalized = rawSource.trim().toLowerCase();
  return (
    DOMAIN_MAP[normalized] ??
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
  const source = normalizeSourceName(utm.source);
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
      <div
        className={cn('text-[13px] text-secondary-token truncate', className)}
      >
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
      <div className={cn('text-[13px] text-tertiary-token', className)}>
        Direct
      </div>
    );
  }

  const latestReferrer = referrerHistory.find(
    entry => !isInternalReferrer(entry.url)
  );
  if (!latestReferrer) {
    return (
      <div className={cn('text-[13px] text-tertiary-token', className)}>
        Direct
      </div>
    );
  }
  const sourceLabel = parseSourceLabel(latestReferrer.url);

  return (
    <div className={cn('text-[13px] text-secondary-token truncate', className)}>
      {sourceLabel}
    </div>
  );
}
