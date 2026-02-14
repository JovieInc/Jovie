// =====================================
// SHARED TYPE EXPORTS
// =====================================
// This file exports commonly used types and enums for easy importing across the app
// Usage: import { LinkType, SubscriptionPlan } from '@/types';

// Import and re-export SOCIAL_PLATFORMS from canonical source
// (import needed for local use in isValidSocialPlatform, export for consumers)
import { SOCIAL_PLATFORMS } from '@/constants/platforms';
export { SOCIAL_PLATFORMS }; // NOSONAR - must import locally for isValidSocialPlatform

// Import types for internal use
import type {
  CreatorType,
  CurrencyCode,
  LinkType,
  SocialPlatform,
  SubscriptionPlan,
  SubscriptionStatus,
} from './db';

export type {
  AudienceAction,
  AudienceIntentLevel,
  AudienceMember,
  AudienceMemberType,
  AudienceReferrer,
  AudienceUtmParams,
} from './audience';
// Contact / CRM types
export type {
  Contact,
  ContactSidebarMode,
  ContactSocialLink,
} from './contact';
export type {
  ContactChannel,
  ContactRole,
  DashboardContact,
  DashboardContactInput,
  PublicContact,
  PublicContactChannel,
} from './contacts';
export type { DashboardBreadcrumbItem, SaveStatus } from './dashboard';
// Re-export shared enums and types from db.ts
export type {
  // Core interfaces
  AppUser,
  // Backwards compatibility
  Artist,
  // Specialized types
  ArtistProfile,
  // Analytics interfaces
  ClickEvent,
  CreatorContact,
  CreatorProfile,
  // Enums
  CreatorType,
  CurrencyCode,
  IngestionJob,
  IngestionJobStatus,
  IngestionSourceType,
  IngestionStatus,
  LegacySocialLink,
  LinkType,
  PodcasterProfile,
  // Utility interfaces
  RateLimitResult,
  // Content interfaces
  Release,
  ScraperConfig,
  ScraperStrategy,
  SocialAccount,
  SocialAccountStatus,
  SocialLink,
  SocialLinkState,
  SocialPlatform,
  // Billing interfaces
  Subscription,
  SubscriptionPlan,
  SubscriptionStatus,
  Tip,
  User,
} from './db';
// Re-export utility functions
export {
  convertArtistToCreatorProfile,
  convertCreatorProfileToArtist,
  isArtistProfile,
  isPodcasterProfile,
} from './db';
export type {
  HudAccessMode,
  HudBranding,
  HudDeploymentRun,
  HudDeploymentState,
  HudDeployments,
  HudMetrics,
  HudOperationsStatus,
  HudOverviewMetrics,
} from './hud';

// =====================================
// CONSTANTS FOR SHARED ENUMS
// =====================================
// These constants can be used for validation, select options, etc.

export const CREATOR_TYPES: readonly CreatorType[] = [
  'artist',
  'podcaster',
  'influencer',
  'creator',
] as const;

// Theme mode for user preference (persisted)
export type ThemeMode = 'system' | 'light' | 'dark';
export const THEME_MODES: readonly ThemeMode[] = [
  'system',
  'light',
  'dark',
] as const;

export function isValidThemeMode(value: string): value is ThemeMode {
  return (THEME_MODES as readonly string[]).includes(value);
}

export const LINK_TYPES: readonly LinkType[] = [
  'listen',
  'social',
  'tip',
  'other',
] as const;

export const SUBSCRIPTION_PLANS: readonly SubscriptionPlan[] = [
  'free',
  'basic',
  'premium',
  'pro',
] as const;

export const SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  'active',
  'inactive',
  'cancelled',
  'past_due',
  'trialing',
  'incomplete',
  'incomplete_expired',
  'unpaid',
] as const;

export const CURRENCY_CODES: readonly CurrencyCode[] = [
  'USD',
  'EUR',
  'GBP',
  'CAD',
  'AUD',
  'JPY',
  'CHF',
  'SEK',
  'NOK',
  'DKK',
] as const;

// =====================================
// VALIDATION HELPERS
// =====================================

export function isValidCreatorType(value: string): value is CreatorType {
  return CREATOR_TYPES.includes(value as CreatorType);
}

export function isValidLinkType(value: string): value is LinkType {
  return LINK_TYPES.includes(value as LinkType);
}

export function isValidSubscriptionPlan(
  value: string
): value is SubscriptionPlan {
  return SUBSCRIPTION_PLANS.includes(value as SubscriptionPlan);
}

export function isValidSubscriptionStatus(
  value: string
): value is SubscriptionStatus {
  return SUBSCRIPTION_STATUSES.includes(value as SubscriptionStatus);
}

export function isValidCurrencyCode(value: string): value is CurrencyCode {
  return CURRENCY_CODES.includes(value as CurrencyCode);
}

export function isValidSocialPlatform(value: string): value is SocialPlatform {
  return SOCIAL_PLATFORMS.includes(value as SocialPlatform);
}

// =====================================
// DISPLAY HELPERS
// =====================================

export function getCreatorTypeLabel(type: CreatorType): string {
  const labels: Record<CreatorType, string> = {
    artist: 'Artist',
    podcaster: 'Podcaster',
    influencer: 'Influencer',
    creator: 'Creator',
  };
  return labels[type];
}

export function getSubscriptionPlanLabel(plan: SubscriptionPlan): string {
  const labels: Record<SubscriptionPlan, string> = {
    free: 'Free',
    basic: 'Basic',
    premium: 'Premium',
    pro: 'Pro',
  };
  return labels[plan];
}

export function getSubscriptionStatusLabel(status: SubscriptionStatus): string {
  const labels: Record<SubscriptionStatus, string> = {
    active: 'Active',
    inactive: 'Inactive',
    cancelled: 'Cancelled',
    past_due: 'Past Due',
    trialing: 'Trialing',
    incomplete: 'Incomplete',
    incomplete_expired: 'Incomplete (Expired)',
    unpaid: 'Unpaid',
  };
  return labels[status];
}

export function getCurrencySymbol(code: CurrencyCode): string {
  const symbols: Record<CurrencyCode, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    CAD: 'C$',
    AUD: 'A$',
    JPY: '¥',
    CHF: 'CHF',
    SEK: 'kr',
    NOK: 'kr',
    DKK: 'kr',
  };
  return symbols[code];
}

export function getSocialPlatformLabel(platform: SocialPlatform): string {
  const labels: Partial<Record<SocialPlatform, string>> = {
    spotify: 'Spotify',
    apple_music: 'Apple Music',
    youtube: 'YouTube',
    youtube_music: 'YouTube Music',
    soundcloud: 'SoundCloud',
    bandcamp: 'Bandcamp',
    instagram: 'Instagram',
    twitter: 'Twitter',
    x: 'X (Twitter)',
    tiktok: 'TikTok',
    facebook: 'Facebook',
    linkedin: 'LinkedIn',
    twitch: 'Twitch',
    discord: 'Discord',
    patreon: 'Patreon',
    venmo: 'Venmo',
    paypal: 'PayPal',
    cashapp: 'Cash App',
    ko_fi: 'Ko-fi',
    buymeacoffee: 'Buy Me a Coffee',
    linktree: 'Linktree',
    website: 'Website',
    email: 'Email',
    phone: 'Phone',
  };
  if (!platform) return '';
  return (
    labels[platform] ||
    platform
      .replaceAll('_', ' ')
      .replaceAll(/\b\w/g, (l: string) => l.toUpperCase())
  );
}

export type UserPlan = 'free' | 'pro' | 'growth';

export interface UserEntitlements {
  userId: string | null;
  email: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  // Plan info
  plan: UserPlan;
  isPro: boolean; // true for pro or growth
  hasAdvancedFeatures: boolean; // true for growth only
  // Feature gates
  canRemoveBranding: boolean;
  canExportContacts: boolean;
  canAccessAdvancedAnalytics: boolean;
  canFilterSelfFromAnalytics: boolean;
  // Limits
  analyticsRetentionDays: number;
  contactsLimit: number | null; // null = unlimited
}
