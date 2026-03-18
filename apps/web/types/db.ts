// =====================================
// SHARED ENUMS AND TYPES
// =====================================

// Import SocialPlatform from the canonical source
export type { SocialPlatform } from '@/constants/platforms';

import { toISOStringSafe } from '@/lib/utils/date';

// Creator type enum
export type CreatorType = 'artist' | 'podcaster' | 'influencer' | 'creator';

// Link type enum that matches the database enum
export type LinkType = 'listen' | 'social' | 'tip' | 'other';

// Subscription enums that match database enums
export type SubscriptionPlan = 'free' | 'basic' | 'premium' | 'pro';
export type SubscriptionStatus =
  | 'active'
  | 'inactive'
  | 'cancelled'
  | 'past_due'
  | 'trialing'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid';

export type IngestionStatus = 'idle' | 'pending' | 'processing' | 'failed';

export type IngestionSourceType = 'manual' | 'admin' | 'ingested';

export type SocialLinkState = 'active' | 'suggested' | 'rejected';

export type SocialAccountStatus = 'suspected' | 'confirmed' | 'rejected';

export type IngestionJobStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed';

export type ScraperStrategy = 'http' | 'browser' | 'api';

// Currency codes that match database enum
export type CurrencyCode =
  | 'USD'
  | 'EUR'
  | 'GBP'
  | 'CAD'
  | 'AUD'
  | 'JPY'
  | 'CHF'
  | 'SEK'
  | 'NOK'
  | 'DKK';

export type ContactRole =
  | 'bookings'
  | 'management'
  | 'press_pr'
  | 'brand_partnerships'
  | 'fan_general'
  | 'other';

export type ContactChannel = 'email' | 'phone';

// =====================================
// CORE INTERFACES
// =====================================

export interface AppUser {
  id: string; // Clerk user id (sub)
  email: string | null;
  // Billing fields
  is_pro: boolean;
  plan?: string;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  billing_updated_at?: string;
  created_at: string;
}

export interface CreatorProfile {
  id: string;
  user_id: string | null; // Nullable to support unclaimed profiles
  creator_type: CreatorType;
  username: string;
  display_name: string | null;
  venmo_handle?: string | null;
  avatar_locked_by_user?: boolean;
  display_name_locked?: boolean;
  ingestion_status?: IngestionStatus;
  bio: string | null;
  avatar_url: string | null;
  // Music platform URLs (for artists)
  spotify_url: string | null;
  apple_music_url: string | null;
  youtube_url: string | null;
  spotify_id: string | null;
  // Additional DSP IDs for cross-platform matching
  apple_music_id?: string | null;
  youtube_music_id?: string | null;
  deezer_id?: string | null;
  tidal_id?: string | null;
  soundcloud_id?: string | null;
  // Visibility and metadata
  is_public: boolean;
  is_verified: boolean;
  is_featured: boolean;
  marketing_opt_out: boolean;
  // Claiming functionality
  is_claimed: boolean;
  claim_token: string | null;
  claimed_at: string | null;
  // About / bio metadata
  location?: string | null;
  active_since_year?: number | null;
  // Monitoring and analytics
  last_login_at?: string;
  profile_views: number;
  onboarding_completed_at?: string;
  // Generated columns (computed by database)
  username_normalized: string; // Auto-generated lowercase username
  search_text: string; // Auto-generated searchable text
  display_title: string; // Auto-generated display name or username fallback
  profile_completion_pct: number; // Auto-calculated completion percentage (0-100)
  // Audit fields
  created_by?: string; // User ID who created this record
  updated_by?: string; // User ID who last updated this record
  settings: Record<string, unknown> | null;
  theme: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface ArtistSettings extends Record<string, unknown> {
  hide_branding?: boolean;
  exclude_self_from_analytics?: boolean;
  hometown?: string | null;
}

// Backwards compatibility - Artist interface mapped from CreatorProfile
export interface Artist {
  id: string;
  owner_user_id: string; // maps to user_id
  handle: string; // maps to username
  spotify_id: string;
  name: string; // maps to display_name
  image_url?: string; // maps to avatar_url
  tagline?: string; // maps to bio
  theme?: Record<string, unknown>;
  settings?: ArtistSettings;
  spotify_url?: string;
  apple_music_url?: string;
  youtube_url?: string;
  // Additional DSP IDs for cross-platform matching
  apple_music_id?: string;
  youtube_music_id?: string;
  deezer_id?: string;
  tidal_id?: string;
  soundcloud_id?: string;
  venmo_handle?: string;
  location?: string | null;
  hometown?: string | null;
  active_since_year?: number | null;
  genres?: string[] | null;
  published: boolean; // maps to is_public
  is_verified: boolean;
  is_featured: boolean;
  marketing_opt_out: boolean;
  created_at: string;
}

// Legacy User interface for backwards compatibility
export interface User {
  id: string;
  clerk_id: string;
  email: string;
  created_at: string;
}

// =====================================
// CREATOR AND PROFILE INTERFACES
// =====================================

export interface SocialLink {
  id: string;
  creator_profile_id: string; // References creator_profiles.id (matches actual DB column name)
  platform: string; // Free-form platform name (for backwards compatibility)
  platform_type: string; // Validated platform enum or category
  url: string;
  display_text?: string; // Optional custom display text (e.g., "@username")
  sort_order: number; // For custom ordering of links
  clicks: number;
  is_active: boolean; // Allow creators to hide/show links temporarily
  state?: SocialLinkState;
  confidence?: number;
  source_platform?: string | null;
  source_type?: IngestionSourceType;
  evidence?: {
    sources?: string[];
    signals?: string[];
  } | null;
  // Audit fields
  created_by?: string; // User ID who created this record
  updated_by?: string; // User ID who last updated this record
  created_at: string;
  updated_at: string;
}

export interface SocialAccount {
  id: string;
  creator_profile_id: string;
  platform: string;
  handle?: string | null;
  url?: string | null;
  status: SocialAccountStatus;
  confidence?: number | null;
  is_verified_flag?: boolean;
  paid_flag?: boolean;
  raw_data?: Record<string, unknown> | null;
  source_platform?: string | null;
  source_type?: IngestionSourceType;
  created_at: string;
  updated_at: string;
}

export interface IngestionJob {
  id: string;
  job_type: string;
  payload: Record<string, unknown>;
  status: IngestionJobStatus;
  error?: string | null;
  attempts: number;
  run_at: string;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface ScraperConfig {
  id: string;
  network: string;
  strategy: ScraperStrategy;
  max_concurrency: number;
  max_jobs_per_minute: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreatorContact {
  id: string;
  creator_profile_id: string;
  role: ContactRole;
  custom_label?: string | null;
  person_name?: string | null;
  company_name?: string | null;
  territories: string[];
  email?: string | null;
  phone?: string | null;
  preferred_channel?: ContactChannel | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// Legacy interface for backwards compatibility
export interface LegacySocialLink {
  id: string;
  artist_id: string; // Old reference for backwards compatibility
  platform: string;
  url: string;
  clicks: number;
  created_at: string;
  is_visible?: boolean; // Optional visibility flag for preview filtering
}

// =====================================
// CONTENT AND MONETIZATION INTERFACES
// =====================================

export interface Release {
  id: string;
  creator_id: string; // References creator_profiles.id
  dsp: string; // Digital Service Provider (spotify, apple, etc.)
  title: string;
  url: string;
  release_date?: string;
  created_at: string;
  updated_at: string;
}

// =====================================
// ANALYTICS AND TRACKING INTERFACES
// =====================================

export interface ClickEvent {
  id: string;
  creator_id: string; // References creator_profiles.id (matches DB after rename from artist_id)
  link_type: LinkType; // Enum: listen | social | tip | other
  target: string; // The platform/service clicked (spotify, instagram, etc.)
  ua?: string; // User agent for analytics
  platform_detected?: string; // Detected platform (mobile, desktop, etc.)
  created_at: string;
}

// =====================================
// BILLING AND SUBSCRIPTION INTERFACES
// =====================================

export interface Subscription {
  id: string;
  user_id: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  // Stripe integration fields
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  stripe_price_id?: string;
  // Legacy RevenueCat support
  revenuecat_id?: string;
  // Subscription timing
  current_period_start?: string;
  current_period_end?: string;
  trial_start?: string;
  trial_end?: string;
  cancelled_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Tip {
  id: string;
  creator_id: string; // References creator_profiles.id
  contact_email?: string;
  contact_phone?: string;
  amount_cents: number;
  currency: CurrencyCode;
  payment_intent: string; // Stripe payment intent ID
  created_at: string;
  updated_at: string;
}

// Rate limiting interface for anonymous onboarding flows
export interface RateLimitResult {
  allowed: boolean;
  remaining_attempts: number;
  reset_at?: string;
  reason?: string;
  rate_limit_key?: string;
  window_minutes?: number;
  error?: string;
}

// =====================================
// UTILITY TYPES AND FUNCTIONS
// =====================================

// Specific creator profile types
export interface ArtistProfile extends CreatorProfile {
  creator_type: 'artist';
}

export interface PodcasterProfile extends CreatorProfile {
  creator_type: 'podcaster';
}

// Type guards
export function isArtistProfile(
  profile: CreatorProfile
): profile is ArtistProfile {
  return profile.creator_type === 'artist';
}

export function isPodcasterProfile(
  profile: CreatorProfile
): profile is PodcasterProfile {
  return profile.creator_type === 'podcaster';
}

// Conversion utilities

type CanonicalArtistProfileShape = {
  id: string;
  userId: string | null;
  username: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  spotifyId: string | null;
  spotifyUrl: string | null;
  appleMusicUrl: string | null;
  youtubeUrl: string | null;
  appleMusicId?: string | null;
  youtubeMusicId?: string | null;
  deezerId?: string | null;
  tidalId?: string | null;
  soundcloudId?: string | null;
  venmoHandle?: string | null;
  location?: string | null;
  hometown?: string | null;
  activeSinceYear?: number | null;
  genres?: string[] | null;
  isPublic: boolean;
  isVerified: boolean;
  isFeatured: boolean;
  marketingOptOut: boolean;
  settings: Record<string, unknown> | null;
  theme: Record<string, unknown> | null;
  createdAt: string;
};

export function getHometownFromSettings(
  settings: Record<string, unknown> | null | undefined
): string | null {
  const hometown = settings?.hometown;
  if (typeof hometown !== 'string') {
    return null;
  }

  const trimmedHometown = hometown.trim();
  return trimmedHometown ? trimmedHometown : null;
}

function mapCanonicalProfileToArtist(
  profile: CanonicalArtistProfileShape
): Artist {
  const artistSettings = (profile.settings as ArtistSettings | null) ?? {
    hide_branding: false,
  };
  const hometown =
    profile.hometown ?? getHometownFromSettings(profile.settings);

  return {
    id: profile.id,
    owner_user_id: profile.userId || '',
    handle: profile.username,
    spotify_id: profile.spotifyId || '',
    name: profile.displayName || profile.username,
    image_url: profile.avatarUrl || undefined,
    tagline: profile.bio || undefined,
    theme: profile.theme || undefined,
    settings: artistSettings,
    spotify_url: profile.spotifyUrl || undefined,
    apple_music_url: profile.appleMusicUrl || undefined,
    youtube_url: profile.youtubeUrl || undefined,
    apple_music_id: profile.appleMusicId || undefined,
    youtube_music_id: profile.youtubeMusicId || undefined,
    deezer_id: profile.deezerId || undefined,
    tidal_id: profile.tidalId || undefined,
    soundcloud_id: profile.soundcloudId || undefined,
    venmo_handle: profile.venmoHandle || undefined,
    location: profile.location ?? null,
    hometown,
    active_since_year: profile.activeSinceYear ?? null,
    genres: profile.genres ?? null,
    published: profile.isPublic,
    is_verified: profile.isVerified,
    is_featured: profile.isFeatured,
    marketing_opt_out: profile.marketingOptOut,
    created_at: profile.createdAt,
  };
}

export function convertCreatorProfileToArtist(profile: CreatorProfile): Artist {
  return mapCanonicalProfileToArtist({
    id: profile.id,
    userId: profile.user_id,
    username: profile.username,
    displayName: profile.display_name,
    avatarUrl: profile.avatar_url,
    bio: profile.bio,
    spotifyId: profile.spotify_id,
    spotifyUrl: profile.spotify_url,
    appleMusicUrl: profile.apple_music_url,
    youtubeUrl: profile.youtube_url,
    appleMusicId: profile.apple_music_id,
    youtubeMusicId: profile.youtube_music_id,
    deezerId: profile.deezer_id,
    tidalId: profile.tidal_id,
    soundcloudId: profile.soundcloud_id,
    location: profile.location,
    activeSinceYear: profile.active_since_year,
    isPublic: profile.is_public,
    isVerified: profile.is_verified,
    isFeatured: profile.is_featured,
    marketingOptOut: profile.marketing_opt_out,
    settings: profile.settings,
    theme: profile.theme,
    createdAt: profile.created_at,
  });
}

export function convertArtistToCreatorProfile(
  artist: Artist
): Partial<CreatorProfile> {
  const settings =
    artist.settings || artist.hometown !== undefined
      ? {
          ...(artist.settings ?? {}),
          ...(artist.hometown !== undefined
            ? { hometown: artist.hometown }
            : {}),
        }
      : undefined;

  return {
    user_id: artist.owner_user_id,
    creator_type: 'artist',
    username: artist.handle,
    display_name: artist.name,
    bio: artist.tagline,
    avatar_url: artist.image_url,
    spotify_url: artist.spotify_url,
    apple_music_url: artist.apple_music_url,
    youtube_url: artist.youtube_url,
    spotify_id: artist.spotify_id,
    is_public: artist.published,
    is_verified: artist.is_verified,
    is_featured: artist.is_featured,
    marketing_opt_out: artist.marketing_opt_out,
    settings,
    theme: artist.theme,
  };
}

// New conversion utility for Drizzle schema types (camelCase)
export function convertDrizzleCreatorProfileToArtist(
  profile: import('@/lib/db/schema').CreatorProfile
): Artist {
  return mapCanonicalProfileToArtist({
    id: profile.id,
    userId: profile.userId,
    username: profile.username,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    bio: profile.bio,
    spotifyId: profile.spotifyId,
    spotifyUrl: profile.spotifyUrl,
    appleMusicUrl: profile.appleMusicUrl,
    youtubeUrl: profile.youtubeUrl,
    appleMusicId: profile.appleMusicId,
    youtubeMusicId: profile.youtubeMusicId,
    deezerId: profile.deezerId,
    tidalId: profile.tidalId,
    soundcloudId: profile.soundcloudId,
    venmoHandle: profile.venmoHandle,
    location: profile.location,
    activeSinceYear: profile.activeSinceYear,
    genres: profile.genres,
    isPublic: profile.isPublic ?? false,
    isVerified: profile.isVerified ?? false,
    isFeatured: profile.isFeatured ?? false,
    marketingOptOut: profile.marketingOptOut ?? false,
    settings: (profile.settings ?? null) as Record<string, unknown> | null,
    theme: (profile.theme ?? null) as Record<string, unknown> | null,
    createdAt: toISOStringSafe(profile.createdAt),
  });
}
