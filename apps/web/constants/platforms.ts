/**
 * @fileoverview Canonical Platform Registry - Single Source of Truth
 *
 * This module is the **SINGLE SOURCE OF TRUTH** for all social platform definitions
 * in the Jovie application. It consolidates platform definitions that were previously
 * scattered across multiple files (constants/app.ts, types/index.ts, eslint-rules/icon-usage.js)
 * into one authoritative location.
 *
 * ## Why This File Exists
 *
 * Before consolidation, platform definitions were duplicated across multiple files with
 * different subsets and inconsistent data. This led to:
 * - Confusion about which list to use
 * - Bugs when one list was updated but others weren't
 * - Inconsistent platform IDs and metadata
 *
 * Now, all platform data lives here, and other files import from this module.
 *
 * ## Architecture
 *
 * ```
 * constants/platforms.ts (this file - source of truth)
 *     ↓
 * ├── types/db.ts (imports SocialPlatform type)
 * ├── types/index.ts (re-exports for backwards compatibility)
 * ├── constants/app.ts (re-exports for backwards compatibility)
 * ├── constants/platforms.cjs (CommonJS export for ESLint rules)
 * └── lib/utils/platform-detection.ts (imports PLATFORM_METADATA_MAP)
 * ```
 *
 * ## Exports Overview
 *
 * **Types:**
 * - `SocialPlatform` - Union type of all valid platform IDs
 * - `PlatformCategory` - Union type of all category names
 * - `PlatformMetadata` - Interface for platform metadata structure
 *
 * **Constants:**
 * - `ALL_PLATFORMS` - Complete readonly array of all platform metadata
 * - `SOCIAL_PLATFORMS` - Readonly array of just the platform IDs
 * - `PLATFORM_METADATA_MAP` - O(1) lookup map from ID to metadata
 * - `CATEGORY_LABELS` - Human-readable labels for each category
 * - `CATEGORY_ORDER` - Ordered array of categories for UI display
 *
 * **Functions:**
 * - `isValidPlatform(value)` - Type guard for validating platform IDs
 * - `getPlatformsByCategory()` - Get platforms grouped by category
 * - `getPlatformMetadata(id)` - Get metadata for a specific platform
 *
 * ## How to Add a New Platform
 *
 * 1. **Find the appropriate category section** in the ALL_PLATFORMS array below
 *    (look for the comment headers like "// Music Platforms (DSPs)")
 *
 * 2. **Add your platform object** with these required fields:
 *    ```ts
 *    {
 *      id: 'platform_name',      // snake_case, unique identifier
 *      name: 'Platform Name',    // Display name for UI
 *      category: 'social',       // One of the PlatformCategory values
 *      icon: 'platformname',     // Simple Icons slug (https://simpleicons.org/)
 *      color: 'HEXCODE',         // Brand color WITHOUT the # prefix
 *    },
 *    ```
 *
 * 3. **Run TypeScript compilation** to verify types: `pnpm typecheck`
 *
 * 4. **Update platforms.cjs** if you added a new platform (it's manually synced):
 *    `apps/web/constants/platforms.cjs`
 *
 * ## Category Definitions
 *
 * | Category          | Description                                      | Examples                     |
 * |-------------------|--------------------------------------------------|------------------------------|
 * | `music`           | Digital Service Providers (DSPs) for streaming   | Spotify, Apple Music, Tidal  |
 * | `social`          | General social media platforms                   | Instagram, Twitter, TikTok   |
 * | `creator`         | Content creation and monetization platforms      | Twitch, Patreon, OnlyFans    |
 * | `link_aggregators`| Link-in-bio and multi-link services             | Linktree, Beacons, Linkfire  |
 * | `payment`         | Payment and tipping platforms                    | Venmo, PayPal, Cash App      |
 * | `messaging`       | Direct messaging and communication platforms     | WhatsApp, Telegram, Signal   |
 * | `professional`    | Professional and business-related links          | Website, Blog, Portfolio     |
 * | `other`           | Catch-all for platforms that don't fit elsewhere | Custom links                 |
 *
 * ## Usage Examples
 *
 * ```ts
 * import {
 *   SOCIAL_PLATFORMS,
 *   SocialPlatform,
 *   isValidPlatform,
 *   getPlatformMetadata,
 *   getPlatformsByCategory,
 * } from '@/constants/platforms';
 *
 * // Validate user input
 * function handlePlatformInput(input: string) {
 *   if (isValidPlatform(input)) {
 *     // input is now typed as SocialPlatform
 *     const metadata = getPlatformMetadata(input);
 *     console.log(`Selected: ${metadata?.name} (${metadata?.color})`);
 *   }
 * }
 *
 * // Render platforms in a dropdown
 * const platformsByCategory = getPlatformsByCategory();
 * Object.entries(platformsByCategory).map(([category, platforms]) => {
 *   // Render category header and platforms
 * });
 *
 * // Type-safe platform handling
 * function saveSocialLink(platform: SocialPlatform, url: string) {
 *   // platform is guaranteed to be a valid platform ID
 * }
 * ```
 *
 * @module constants/platforms
 * @see {@link https://simpleicons.org/} for icon slugs
 */

/**
 * Platform category types.
 *
 * Used to organize platforms into logical groups for UI display and filtering.
 * When adding a new category, also update:
 * - {@link CATEGORY_LABELS} with a display name
 * - {@link CATEGORY_ORDER} with the display position
 *
 * @see {@link CATEGORY_LABELS} for human-readable category names
 * @see {@link CATEGORY_ORDER} for the ordering of categories in UI
 */
export type PlatformCategory =
  | 'music'
  | 'social'
  | 'creator'
  | 'link_aggregators'
  | 'payment'
  | 'messaging'
  | 'professional'
  | 'other';

/**
 * Platform metadata structure.
 *
 * This interface defines the shape of platform entries in {@link ALL_PLATFORMS}.
 * All fields are readonly to prevent accidental mutation.
 *
 * @example
 * ```ts
 * const platform: PlatformMetadata = {
 *   id: 'spotify',
 *   name: 'Spotify',
 *   category: 'music',
 *   icon: 'spotify',
 *   color: '1DB954',
 * };
 * ```
 */
export interface PlatformMetadata {
  /**
   * Unique identifier in snake_case format.
   * This is used as the primary key for platform lookups and database storage.
   * @example 'apple_music', 'youtube_music', 'ko_fi'
   */
  readonly id: string;

  /**
   * Human-readable display name for UI.
   * Should match the platform's official branding.
   * @example 'Apple Music', 'YouTube Music', 'Ko-fi'
   */
  readonly name: string;

  /**
   * Platform category for grouping in UI and filtering.
   * @see {@link PlatformCategory} for available categories
   */
  readonly category: PlatformCategory;

  /**
   * Simple Icons slug for the platform icon.
   * Find slugs at https://simpleicons.org/
   * For generic icons, use: 'link', 'globe', 'mail', 'phone', 'calendar', etc.
   * @example 'spotify', 'applemusic', 'youtubemusic'
   */
  readonly icon: string;

  /**
   * Brand color in hex format WITHOUT the '#' prefix.
   * Used for theming and visual identification.
   * Use '6B7280' (gray-500) for generic/fallback colors.
   * @example '1DB954' (Spotify green), 'FF0000' (YouTube red)
   */
  readonly color: string;
}

/**
 * Complete list of all supported platforms organized by category.
 *
 * This is the **canonical source of truth** for platform definitions.
 * The array is organized by category with section comments for easy navigation.
 * All entries are readonly via `as const satisfies readonly PlatformMetadata[]`.
 *
 * **Total platforms:** 52
 *
 * @remarks
 * When adding a new platform, add it to the appropriate category section
 * (identified by the comment headers like `// Music Platforms (DSPs)`).
 * The order within each category determines display order in the UI.
 *
 * @see {@link SOCIAL_PLATFORMS} for just the platform IDs
 * @see {@link PLATFORM_METADATA_MAP} for O(1) lookups by ID
 */
export const ALL_PLATFORMS = [
  // ========================================
  // Music Platforms (DSPs)
  // ========================================
  {
    id: 'spotify',
    name: 'Spotify',
    category: 'music',
    icon: 'spotify',
    color: '1DB954',
  },
  {
    id: 'apple_music',
    name: 'Apple Music',
    category: 'music',
    icon: 'applemusic',
    color: 'FA2D48',
  },
  {
    id: 'youtube_music',
    name: 'YouTube Music',
    category: 'music',
    icon: 'youtubemusic',
    color: 'FF0000',
  },
  {
    id: 'soundcloud',
    name: 'SoundCloud',
    category: 'music',
    icon: 'soundcloud',
    color: 'FF5500',
  },
  {
    id: 'bandcamp',
    name: 'Bandcamp',
    category: 'music',
    icon: 'bandcamp',
    color: '629AA0',
  },
  {
    id: 'tidal',
    name: 'Tidal',
    category: 'music',
    icon: 'tidal',
    color: '000000',
  },
  {
    id: 'deezer',
    name: 'Deezer',
    category: 'music',
    icon: 'deezer',
    color: 'FEAA2D',
  },
  {
    id: 'amazon_music',
    name: 'Amazon Music',
    category: 'music',
    icon: 'amazonmusic',
    color: '00A8E1',
  },
  {
    id: 'pandora',
    name: 'Pandora',
    category: 'music',
    icon: 'pandora',
    color: '005483',
  },

  // ========================================
  // Social Media Platforms
  // ========================================
  {
    id: 'instagram',
    name: 'Instagram',
    category: 'social',
    icon: 'instagram',
    color: 'E4405F',
  },
  {
    id: 'twitter',
    name: 'Twitter',
    category: 'social',
    icon: 'x',
    color: '000000',
  },
  {
    id: 'x',
    name: 'X',
    category: 'social',
    icon: 'x',
    color: '000000',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    category: 'social',
    icon: 'tiktok',
    color: '000000',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    category: 'social',
    icon: 'youtube',
    color: 'FF0000',
  },
  {
    id: 'facebook',
    name: 'Facebook',
    category: 'social',
    icon: 'facebook',
    color: '1877F2',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    category: 'social',
    icon: 'linkedin',
    color: '0A66C2',
  },
  {
    id: 'snapchat',
    name: 'Snapchat',
    category: 'social',
    icon: 'snapchat',
    color: 'FFFC00',
  },
  {
    id: 'pinterest',
    name: 'Pinterest',
    category: 'social',
    icon: 'pinterest',
    color: 'E60023',
  },
  {
    id: 'reddit',
    name: 'Reddit',
    category: 'social',
    icon: 'reddit',
    color: 'FF4500',
  },

  // ========================================
  // Creator/Content Platforms
  // ========================================
  {
    id: 'twitch',
    name: 'Twitch',
    category: 'creator',
    icon: 'twitch',
    color: '9146FF',
  },
  {
    id: 'discord',
    name: 'Discord',
    category: 'creator',
    icon: 'discord',
    color: '5865F2',
  },
  {
    id: 'patreon',
    name: 'Patreon',
    category: 'creator',
    icon: 'patreon',
    color: 'FF424D',
  },
  {
    id: 'onlyfans',
    name: 'OnlyFans',
    category: 'creator',
    icon: 'onlyfans',
    color: '00AFF0',
  },
  {
    id: 'substack',
    name: 'Substack',
    category: 'creator',
    icon: 'substack',
    color: 'FF6719',
  },
  {
    id: 'medium',
    name: 'Medium',
    category: 'creator',
    icon: 'medium',
    color: '000000',
  },
  {
    id: 'github',
    name: 'GitHub',
    category: 'creator',
    icon: 'github',
    color: '181717',
  },
  {
    id: 'behance',
    name: 'Behance',
    category: 'creator',
    icon: 'behance',
    color: '1769FF',
  },
  {
    id: 'dribbble',
    name: 'Dribbble',
    category: 'creator',
    icon: 'dribbble',
    color: 'EA4C89',
  },

  // ========================================
  // Link Aggregators
  // ========================================
  {
    id: 'linktree',
    name: 'Linktree',
    category: 'link_aggregators',
    icon: 'linktree',
    color: '39E09B',
  },
  {
    id: 'beacons',
    name: 'Beacons',
    category: 'link_aggregators',
    icon: 'beacons',
    color: '2BD9FE',
  },
  {
    id: 'linkin_bio',
    name: 'Link in Bio',
    category: 'link_aggregators',
    icon: 'link',
    color: '6B7280',
  },
  {
    id: 'allmylinks',
    name: 'AllMyLinks',
    category: 'link_aggregators',
    icon: 'link',
    color: '6B7280',
  },
  {
    id: 'linkfire',
    name: 'Linkfire',
    category: 'link_aggregators',
    icon: 'linkfire',
    color: 'FF5A3C',
  },
  {
    id: 'toneden',
    name: 'ToneDen',
    category: 'link_aggregators',
    icon: 'link',
    color: '00C7AE',
  },
  {
    id: 'featurefm',
    name: 'Feature.fm',
    category: 'link_aggregators',
    icon: 'link',
    color: 'FF6B35',
  },

  // ========================================
  // Payment/Tip Platforms
  // ========================================
  {
    id: 'venmo',
    name: 'Venmo',
    category: 'payment',
    icon: 'venmo',
    color: '3D95CE',
  },
  {
    id: 'paypal',
    name: 'PayPal',
    category: 'payment',
    icon: 'paypal',
    color: '00457C',
  },
  {
    id: 'cashapp',
    name: 'Cash App',
    category: 'payment',
    icon: 'cashapp',
    color: '00D632',
  },
  {
    id: 'zelle',
    name: 'Zelle',
    category: 'payment',
    icon: 'zelle',
    color: '6D1ED4',
  },
  {
    id: 'ko_fi',
    name: 'Ko-fi',
    category: 'payment',
    icon: 'kofi',
    color: 'FF5E5B',
  },
  {
    id: 'buymeacoffee',
    name: 'Buy Me a Coffee',
    category: 'payment',
    icon: 'buymeacoffee',
    color: 'FFDD00',
  },
  {
    id: 'gofundme',
    name: 'GoFundMe',
    category: 'payment',
    icon: 'gofundme',
    color: '00B964',
  },

  // ========================================
  // Messaging/Communication Platforms
  // ========================================
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    category: 'messaging',
    icon: 'whatsapp',
    color: '25D366',
  },
  {
    id: 'telegram',
    name: 'Telegram',
    category: 'messaging',
    icon: 'telegram',
    color: '26A5E4',
  },
  {
    id: 'signal',
    name: 'Signal',
    category: 'messaging',
    icon: 'signal',
    color: '3A76F0',
  },
  {
    id: 'email',
    name: 'Email',
    category: 'messaging',
    icon: 'mail',
    color: '6B7280',
  },
  {
    id: 'phone',
    name: 'Phone',
    category: 'messaging',
    icon: 'phone',
    color: '6B7280',
  },

  // ========================================
  // Professional Links
  // ========================================
  {
    id: 'website',
    name: 'Website',
    category: 'professional',
    icon: 'globe',
    color: '6B7280',
  },
  {
    id: 'blog',
    name: 'Blog',
    category: 'professional',
    icon: 'rss',
    color: 'FFA500',
  },
  {
    id: 'portfolio',
    name: 'Portfolio',
    category: 'professional',
    icon: 'briefcase',
    color: '6B7280',
  },
  {
    id: 'booking',
    name: 'Booking',
    category: 'professional',
    icon: 'calendar',
    color: '6B7280',
  },
  {
    id: 'press_kit',
    name: 'Press Kit',
    category: 'professional',
    icon: 'document',
    color: '6B7280',
  },

  // ========================================
  // Other
  // ========================================
  {
    id: 'other',
    name: 'Other',
    category: 'other',
    icon: 'link',
    color: '6B7280',
  },
] as const satisfies readonly PlatformMetadata[];

/**
 * Union type representing all valid social platform identifiers.
 *
 * Derived automatically from the {@link ALL_PLATFORMS} array for type safety.
 * TypeScript will enforce that only valid platform IDs are used.
 *
 * @example
 * ```ts
 * // TypeScript will validate the platform ID at compile time
 * const myPlatform: SocialPlatform = 'spotify'; // ✓ Valid
 * const invalid: SocialPlatform = 'not_a_platform'; // ✗ Type error
 * ```
 *
 * @see {@link isValidPlatform} for runtime validation
 */
export type SocialPlatform = (typeof ALL_PLATFORMS)[number]['id'];

/**
 * Readonly array of all valid social platform identifiers.
 *
 * Use this for:
 * - Iterating over all platforms in UI components
 * - Populating dropdown/select options
 * - Validation in schemas (e.g., Zod, Yup)
 *
 * For metadata access, use {@link PLATFORM_METADATA_MAP} or {@link getPlatformMetadata}.
 *
 * @example
 * ```ts
 * // Use in a Zod schema
 * const schema = z.object({
 *   platform: z.enum(SOCIAL_PLATFORMS as unknown as [string, ...string[]]),
 * });
 *
 * // Iterate in React
 * SOCIAL_PLATFORMS.map(id => <option key={id} value={id}>{id}</option>)
 * ```
 */
export const SOCIAL_PLATFORMS = ALL_PLATFORMS.map(
  p => p.id
) as readonly SocialPlatform[];

/**
 * Map of platform ID to metadata for O(1) lookups.
 *
 * Use this when you need to quickly access platform metadata by ID.
 * For a type-safe alternative, use {@link getPlatformMetadata}.
 *
 * @example
 * ```ts
 * const spotifyMeta = PLATFORM_METADATA_MAP['spotify'];
 * console.log(spotifyMeta.name);  // 'Spotify'
 * console.log(spotifyMeta.color); // '1DB954'
 *
 * // Check if platform exists
 * if ('custom_id' in PLATFORM_METADATA_MAP) {
 *   // Platform exists
 * }
 * ```
 */
export const PLATFORM_METADATA_MAP: Readonly<Record<string, PlatformMetadata>> =
  ALL_PLATFORMS.reduce(
    (acc, platform) => {
      acc[platform.id] = platform;
      return acc;
    },
    {} as Record<string, PlatformMetadata>
  );

/**
 * Human-readable display labels for each platform category.
 *
 * Use this for rendering category headers in the UI.
 * The keys match {@link PlatformCategory} values.
 *
 * @example
 * ```tsx
 * const categoryLabel = CATEGORY_LABELS[platform.category];
 * return <h3>{categoryLabel}</h3>;
 * ```
 *
 * @see {@link CATEGORY_ORDER} for the display order of categories
 */
export const CATEGORY_LABELS: Readonly<Record<PlatformCategory, string>> = {
  music: 'Music Platforms',
  social: 'Social Media',
  creator: 'Creator Platforms',
  link_aggregators: 'Link Aggregators',
  payment: 'Payment & Tips',
  messaging: 'Messaging',
  professional: 'Professional',
  other: 'Other',
};

/**
 * Ordered array of categories for consistent UI display.
 *
 * Use this to iterate over categories in a specific order.
 * The order is designed for logical user experience:
 * music platforms first (most relevant for artists), followed by social,
 * then creator platforms, etc.
 *
 * @example
 * ```tsx
 * const grouped = getPlatformsByCategory();
 * return CATEGORY_ORDER.map(category => (
 *   <div key={category}>
 *     <h3>{CATEGORY_LABELS[category]}</h3>
 *     {grouped[category].map(platform => (
 *       <PlatformIcon key={platform.id} {...platform} />
 *     ))}
 *   </div>
 * ));
 * ```
 *
 * @see {@link getPlatformsByCategory} for getting platforms grouped by category
 */
export const CATEGORY_ORDER: readonly PlatformCategory[] = [
  'music',
  'social',
  'creator',
  'link_aggregators',
  'payment',
  'messaging',
  'professional',
  'other',
] as const;

// ============================================================================
// Helper Functions
// ============================================================================
//
// These utility functions provide common operations on the platform registry.
// Use these instead of writing custom logic for platform validation and lookup.
// ============================================================================

/**
 * Type guard to check if a value is a valid social platform identifier.
 *
 * Useful for validating user input, external data, or narrowing types.
 * Uses O(1) lookup against {@link PLATFORM_METADATA_MAP}.
 *
 * @param value - The value to check (any type accepted)
 * @returns `true` if the value is a valid SocialPlatform, `false` otherwise
 *
 * @example
 * ```ts
 * const input: string = getUserInput();
 *
 * if (isValidPlatform(input)) {
 *   // TypeScript now knows input is SocialPlatform
 *   const metadata = getPlatformMetadata(input);
 *   savePlatformLink(input, url); // Type-safe
 * } else {
 *   showError('Invalid platform selected');
 * }
 *
 * // Also works with unknown types from external data
 * const apiResponse: unknown = await fetchData();
 * if (isValidPlatform(apiResponse)) {
 *   // apiResponse is now typed as SocialPlatform
 * }
 * ```
 *
 * @see {@link SocialPlatform} for the type this validates against
 */
export function isValidPlatform(value: unknown): value is SocialPlatform {
  return typeof value === 'string' && value in PLATFORM_METADATA_MAP;
}

/**
 * Get all platforms grouped by category.
 *
 * Returns a readonly record mapping each category to its platforms array.
 * Categories are guaranteed to exist even if empty (initialized from {@link CATEGORY_ORDER}).
 * Useful for rendering categorized platform lists in the UI.
 *
 * @returns Readonly record of category to array of platform metadata
 *
 * @example
 * ```tsx
 * const grouped = getPlatformsByCategory();
 *
 * // Access specific category
 * console.log(grouped.music);
 * // [{ id: 'spotify', ... }, { id: 'apple_music', ... }, ...]
 *
 * // Render categorized list
 * return (
 *   <>
 *     {CATEGORY_ORDER.map(category => (
 *       <section key={category}>
 *         <h2>{CATEGORY_LABELS[category]}</h2>
 *         <ul>
 *           {grouped[category].map(platform => (
 *             <li key={platform.id}>{platform.name}</li>
 *           ))}
 *         </ul>
 *       </section>
 *     ))}
 *   </>
 * );
 * ```
 *
 * @see {@link CATEGORY_ORDER} for the order of categories
 * @see {@link CATEGORY_LABELS} for display labels
 */
export function getPlatformsByCategory(): Readonly<
  Record<PlatformCategory, readonly PlatformMetadata[]>
> {
  const grouped = {} as Record<PlatformCategory, PlatformMetadata[]>;

  // Initialize all categories with empty arrays
  for (const category of CATEGORY_ORDER) {
    grouped[category] = [];
  }

  // Group platforms by category
  for (const platform of ALL_PLATFORMS) {
    grouped[platform.category].push(platform);
  }

  return grouped;
}

/**
 * Get metadata for a specific platform by ID.
 *
 * Returns `undefined` if the platform ID is not found.
 * Uses O(1) lookup against {@link PLATFORM_METADATA_MAP}.
 *
 * For type-safe lookups, first validate with {@link isValidPlatform}.
 *
 * @param id - The platform identifier to look up (e.g., 'spotify', 'apple_music')
 * @returns Platform metadata object or `undefined` if not found
 *
 * @example
 * ```ts
 * // Basic usage
 * const metadata = getPlatformMetadata('spotify');
 * if (metadata) {
 *   console.log(metadata.name);  // "Spotify"
 *   console.log(metadata.color); // "1DB954"
 *   console.log(metadata.icon);  // "spotify"
 * }
 *
 * // Safe access pattern with validation
 * function renderPlatformBadge(platformId: string) {
 *   if (!isValidPlatform(platformId)) {
 *     return <UnknownPlatformBadge />;
 *   }
 *   const meta = getPlatformMetadata(platformId)!; // Safe - we validated
 *   return <Badge color={`#${meta.color}`}>{meta.name}</Badge>;
 * }
 * ```
 *
 * @see {@link isValidPlatform} for validating platform IDs
 * @see {@link PLATFORM_METADATA_MAP} for direct map access
 */
export function getPlatformMetadata(id: string): PlatformMetadata | undefined {
  return PLATFORM_METADATA_MAP[id];
}
