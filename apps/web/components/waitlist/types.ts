export interface FormErrors {
  primaryGoal?: string[];
  primarySocialUrl?: string[];
  spotifyUrl?: string[];
  heardAbout?: string[];
}

export type PrimaryGoal = 'streams' | 'merch' | 'tickets';

export type SocialPlatform = 'instagram' | 'tiktok' | 'youtube' | 'other';

export const BUTTON_CLASSES =
  'w-full h-12 rounded-xl border border-subtle bg-surface-1 px-4 text-[15px] leading-5 font-medium text-primary-token hover:bg-surface-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-ring-themed';

export const ALLOWED_PLANS = new Set(['free', 'branding', 'pro', 'growth']);

export const WAITLIST_STORAGE_KEYS = {
  step: 'waitlist_step',
  primaryGoal: 'waitlist_primary_goal',
  socialPlatform: 'waitlist_social_platform',
  primarySocialUrl: 'waitlist_primary_social_url',
  spotifyUrl: 'waitlist_spotify_url',
  heardAbout: 'waitlist_heard_about',
} as const;

export const SOCIAL_PLATFORM_OPTIONS: Array<{
  value: SocialPlatform;
  label: string;
}> = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'other', label: 'Other' },
];

export const PRIMARY_GOAL_OPTIONS: Array<{ value: PrimaryGoal; label: string }> =
  [
    { value: 'streams', label: 'More streams' },
    { value: 'merch', label: 'More merch sales' },
    { value: 'tickets', label: 'More ticket sales' },
  ];

export function clearWaitlistStorage(): void {
  try {
    Object.values(WAITLIST_STORAGE_KEYS).forEach(key => {
      window.sessionStorage.removeItem(key);
    });
  } catch {
    // Ignore storage errors
  }
}

export function getSocialPlatformPrefix(platform: SocialPlatform): {
  display: string;
  buildUrl: (value: string) => string;
} {
  if (platform === 'instagram') {
    return {
      display: 'instagram.com/',
      buildUrl: value => `https://instagram.com/${value}`,
    };
  }

  if (platform === 'tiktok') {
    return {
      display: 'tiktok.com/@',
      buildUrl: value => `https://tiktok.com/@${value}`,
    };
  }

  if (platform === 'youtube') {
    return {
      display: 'youtube.com/@',
      buildUrl: value => `https://youtube.com/@${value}`,
    };
  }

  return {
    display: '',
    buildUrl: value => value,
  };
}

export function normalizeUrl(url: string): string {
  if (!url.trim()) return '';
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

export function resolvePrimarySocialUrl(
  value: string,
  platform: SocialPlatform
): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) {
    return normalizeUrl(trimmed);
  }

  const { buildUrl } = getSocialPlatformPrefix(platform);
  return normalizeUrl(buildUrl(trimmed));
}

export function isValidUrl(url: string): boolean {
  if (!url.trim()) return false;
  const normalized = normalizeUrl(url);
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}
