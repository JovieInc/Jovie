'use client';

import { SimpleTooltip } from '@jovie/ui';
import { Globe, Music, Search } from 'lucide-react';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { cn } from '@/lib/utils';
import type {
  AudienceAction,
  AudienceReferrer,
  AudienceUtmParams,
} from '@/types';

export interface AudienceSourceCellProps {
  readonly referrerHistory: AudienceReferrer[];
  readonly utmParams?: AudienceUtmParams;
  readonly actions?: AudienceAction[];
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

const ICON_CLASS = 'h-3.5 w-3.5 shrink-0 text-tertiary-token';

/** Pre-allocated icon elements keyed by source name — avoids creating components during render. */
const SOURCE_ICON_ELEMENTS: Record<string, React.ReactElement> = {
  X: <SocialIcon platform='twitter' className={ICON_CLASS} aria-hidden />,
  Instagram: (
    <SocialIcon platform='instagram' className={ICON_CLASS} aria-hidden />
  ),
  YouTube: <SocialIcon platform='youtube' className={ICON_CLASS} aria-hidden />,
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
  utmParams?: AudienceUtmParams,
  actions?: AudienceAction[]
): string {
  const actionSource = actions?.[0]?.sourceLabel;
  if (actionSource) return actionSource;

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
  actions,
  className,
}: AudienceSourceCellProps) {
  const sourceLabel = resolveSource(referrerHistory, utmParams, actions);
  const icon = getIconForSource(sourceLabel);

  return (
    <SimpleTooltip content={sourceLabel} side='top'>
      <div className={cn('flex items-center justify-center w-8', className)}>
        {icon}
      </div>
    </SimpleTooltip>
  );
}
