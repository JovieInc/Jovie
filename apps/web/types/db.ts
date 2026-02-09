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
  // Visibility and metadata
  is_public: boolean;
  is_verified: boolean;
  is_featured: boolean;
  marketing_opt_out: boolean;
  // Claiming functionality
  is_claimed: boolean;
  claim_token: string | null;
  claimed_at: string | null;
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
  settings?: {
    hide_branding?: boolean;
    exclude_self_from_analytics?: boolean;
  };
  spotify_url?: string;
  apple_music_url?: string;
  youtube_url?: string;
  venmo_handle?: string;
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
export function convertCreatorProfileToArtist(profile: CreatorProfile): Artist {
  return {
    id: profile.id,
    owner_user_id: profile.user_id || '', // Handle null user_id for unclaimed profiles
    handle: profile.username,
    spotify_id: profile.spotify_id || '',
    name: profile.display_name || profile.username,
    image_url: profile.avatar_url || undefined,
    tagline: profile.bio || undefined,
    theme: profile.theme || undefined,
    settings: (profile.settings as { hide_branding?: boolean }) || {
      hide_branding: false,
    },
    spotify_url: profile.spotify_url || undefined,
    apple_music_url: profile.apple_music_url || undefined,
    youtube_url: profile.youtube_url || undefined,
    published: profile.is_public,
    is_verified: profile.is_verified,
    is_featured: profile.is_featured,
    marketing_opt_out: profile.marketing_opt_out,
    created_at: profile.created_at,
  };
}

export function convertArtistToCreatorProfile(
  artist: Artist
): Partial<CreatorProfile> {
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
    settings: artist.settings,
    theme: artist.theme,
  };
}

// New conversion utility for Drizzle schema types (camelCase)
export function convertDrizzleCreatorProfileToArtist(
  profile: import('@/lib/db/schema').CreatorProfile
): Artist {
  return {
    id: profile.id,
    owner_user_id: profile.userId || '',
    handle: profile.username,
    spotify_id: profile.spotifyId || '',
    name: profile.displayName || profile.username,
    image_url: profile.avatarUrl || undefined,
    tagline: profile.bio || undefined,
    theme: profile.theme || undefined,
    settings: (profile.settings as { hide_branding?: boolean }) || {
      hide_branding: false,
    },
    spotify_url: profile.spotifyUrl || undefined,
    apple_music_url: profile.appleMusicUrl || undefined,
    youtube_url: profile.youtubeUrl || undefined,
    venmo_handle: profile.venmoHandle || undefined,
    published: profile.isPublic ?? false,
    is_verified: profile.isVerified ?? false,
    is_featured: profile.isFeatured ?? false,
    marketing_opt_out: profile.marketingOptOut ?? false,
    created_at: toISOStringSafe(profile.createdAt),
  };
}
