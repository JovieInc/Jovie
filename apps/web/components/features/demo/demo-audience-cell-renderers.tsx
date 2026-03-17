'use client';

import type { CellContext } from '@tanstack/react-table';
import {
  ArrowLeftRight,
  Flame,
  Globe,
  Instagram,
  Music,
  Search,
  Sparkles,
  Star,
  TrendingDown,
  TrendingUp,
  Twitter,
  Youtube,
} from 'lucide-react';
import type {
  AudienceIntentLevel,
  AudienceMember,
  AudienceReferrer,
  AudienceUtmParams,
} from '@/types';

const ICON_CLS = 'h-3.5 w-3.5 shrink-0';

// --- Intent ---

const INTENT_CONFIG: Record<
  AudienceIntentLevel,
  { icon: React.ReactElement; label: string }
> = {
  high: {
    icon: <Flame className={`${ICON_CLS} text-emerald-500`} aria-hidden />,
    label: 'High',
  },
  medium: {
    icon: <TrendingUp className={`${ICON_CLS} text-amber-400`} aria-hidden />,
    label: 'Medium',
  },
  low: {
    icon: <TrendingDown className={`${ICON_CLS} text-zinc-500`} aria-hidden />,
    label: 'Low',
  },
};

export function renderDemoIntentCell({
  row,
}: CellContext<AudienceMember, AudienceIntentLevel>) {
  const cfg = INTENT_CONFIG[row.original.intentLevel];
  return (
    <span className='inline-flex items-center gap-1.5 text-xs text-secondary-token'>
      {cfg.icon} {cfg.label}
    </span>
  );
}

// --- Returning ---

export function renderDemoReturningCell({
  row,
}: CellContext<AudienceMember, number>) {
  const visits = row.original.visits;
  if (visits > 1) {
    return (
      <span className='inline-flex items-center gap-1.5 text-xs text-blue-400'>
        <ArrowLeftRight className={`${ICON_CLS} text-blue-400`} aria-hidden />
        Yes
      </span>
    );
  }
  if (visits === 1) {
    return (
      <span className='inline-flex items-center gap-1.5 text-xs text-amber-400'>
        <Star className={`${ICON_CLS} text-amber-400`} aria-hidden />
        First
      </span>
    );
  }
  return (
    <span className='inline-flex items-center gap-1.5 text-xs text-emerald-400'>
      <Sparkles className={`${ICON_CLS} text-emerald-400`} aria-hidden />
      New
    </span>
  );
}

// --- Source ---

const DOMAIN_MAP: Record<string, string> = {
  'x.com': 'X',
  'twitter.com': 'X',
  'instagram.com': 'Instagram',
  'youtube.com': 'YouTube',
  'spotify.com': 'Spotify',
  'google.com': 'Google',
  't.co': 'X',
};

const SOURCE_ICONS: Record<string, React.ReactElement> = {
  X: <Twitter className={`${ICON_CLS} text-tertiary-token`} aria-hidden />,
  Instagram: (
    <Instagram className={`${ICON_CLS} text-tertiary-token`} aria-hidden />
  ),
  YouTube: (
    <Youtube className={`${ICON_CLS} text-tertiary-token`} aria-hidden />
  ),
  Spotify: <Music className={`${ICON_CLS} text-tertiary-token`} aria-hidden />,
  Google: <Search className={`${ICON_CLS} text-tertiary-token`} aria-hidden />,
};

function resolveSourceLabel(
  referrerHistory: AudienceReferrer[],
  utmParams?: AudienceUtmParams
): string {
  if (utmParams?.source) {
    const src =
      utmParams.source.charAt(0).toUpperCase() + utmParams.source.slice(1);
    return utmParams.medium ? `${src} / ${utmParams.medium}` : src;
  }
  if (!referrerHistory.length) return 'Direct';
  try {
    const hostname = new URL(referrerHistory[0].url).hostname.replace(
      'www.',
      ''
    );
    return DOMAIN_MAP[hostname] ?? hostname;
  } catch {
    return 'Direct';
  }
}

export function renderDemoSourceCell({
  row,
}: CellContext<AudienceMember, AudienceReferrer[]>) {
  const label = resolveSourceLabel(
    row.original.referrerHistory,
    row.original.utmParams
  );
  const icon = Object.entries(SOURCE_ICONS).find(([name]) =>
    label.startsWith(name)
  )?.[1] ?? <Globe className={`${ICON_CLS} text-tertiary-token`} aria-hidden />;

  return (
    <span className='inline-flex items-center gap-1.5 text-xs text-secondary-token'>
      {icon} {label}
    </span>
  );
}
