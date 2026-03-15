'use client';

import { SimpleTooltip } from '@jovie/ui';
import {
  Globe,
  Instagram,
  Music,
  Search,
  Twitter,
  Youtube,
} from 'lucide-react';
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

const ICON_CLASS = 'h-3.5 w-3.5 shrink-0 text-(--linear-text-tertiary)';

/** Pre-allocated icon elements keyed by source name — avoids creating components during render. */
const SOURCE_ICON_ELEMENTS: Record<string, React.ReactElement> = {
  X: <Twitter className={ICON_CLASS} aria-hidden='true' />,
  Instagram: <Instagram className={ICON_CLASS} aria-hidden='true' />,
  YouTube: <Youtube className={ICON_CLASS} aria-hidden='true' />,
  Spotify: <Music className={ICON_CLASS} aria-hidden='true' />,
  Google: <Search className={ICON_CLASS} aria-hidden='true' />,
};

const FALLBACK_ICON = <Globe className={ICON_CLASS} aria-hidden='true' />;

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

function parseSourceLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace('www.', '');
    return DOMAIN_MAP[hostname] ?? hostname;
  } catch {
    return url || 'Direct';
  }
}

function formatUtmSourceLabel(utm: AudienceUtmParams): string | null {
  if (!utm.source) return null;
  const source = normalizeSourceName(utm.source);
  if (utm.medium) return `${source} / ${utm.medium}`;
  return source;
}

function resolveSource(
  referrerHistory: AudienceReferrer[],
  utmParams?: AudienceUtmParams
): string {
  const utmLabel = utmParams ? formatUtmSourceLabel(utmParams) : null;
  if (utmLabel) return utmLabel;

  if (!referrerHistory.length) return 'Direct';

  const latestReferrer = referrerHistory.find(
    entry => !isInternalReferrer(entry.url)
  );
  if (!latestReferrer) return 'Direct';
  return parseSourceLabel(latestReferrer.url);
}

function getIconForSource(label: string): React.ReactElement {
  for (const [name, icon] of Object.entries(SOURCE_ICON_ELEMENTS)) {
    if (label.startsWith(name)) return icon;
  }
  return FALLBACK_ICON;
}

export function AudienceSourceCell({
  referrerHistory,
  utmParams,
  className,
}: AudienceSourceCellProps) {
  const sourceLabel = resolveSource(referrerHistory, utmParams);
  const icon = getIconForSource(sourceLabel);

  return (
    <SimpleTooltip content={sourceLabel} side='top'>
      <div className={cn('flex items-center justify-center w-8', className)}>
        {icon}
      </div>
    </SimpleTooltip>
  );
}
