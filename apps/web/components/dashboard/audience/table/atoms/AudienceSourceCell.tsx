'use client';

import { cn } from '@/lib/utils';
import type { AudienceReferrer } from '@/types';

export interface AudienceSourceCellProps {
  readonly referrerHistory: AudienceReferrer[];
  readonly className?: string;
}

/**
 * Extracts a human-readable source label from a referrer URL.
 * Detects UTM sources, known social platforms, and falls back to domain name.
 */
function parseSourceLabel(url: string): string {
  try {
    const parsed = new URL(url);

    // Check for UTM source first
    const utmSource = parsed.searchParams.get('utm_source');
    if (utmSource) return utmSource;

    const hostname = parsed.hostname.replace('www.', '');

    // Map known domains to friendly names
    const domainMap: Record<string, string> = {
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

    return domainMap[hostname] ?? hostname;
  } catch {
    // Not a valid URL, return as-is (could be a UTM string)
    return url || 'Direct';
  }
}

export function AudienceSourceCell({
  referrerHistory,
  className,
}: AudienceSourceCellProps) {
  if (!referrerHistory.length) {
    return (
      <div className={cn('text-xs text-tertiary-token', className)}>Direct</div>
    );
  }

  // Show the most recent referrer source
  const latestReferrer = referrerHistory[0];
  const sourceLabel = parseSourceLabel(latestReferrer.url);

  return (
    <div className={cn('text-xs text-secondary-token truncate', className)}>
      {sourceLabel}
    </div>
  );
}
