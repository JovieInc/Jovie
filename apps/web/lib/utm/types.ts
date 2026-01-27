/**
 * UTM Builder Types
 *
 * Comprehensive type definitions for the UTM tracking system.
 * These types support the preset library, custom builder, and analytics integration.
 */

/**
 * Standard UTM parameters as defined by Google Analytics
 */
export interface UTMParams {
  /** Where the traffic originates (required) */
  utm_source: string;
  /** Marketing channel type (required) */
  utm_medium: string;
  /** Specific campaign or promotion (optional, auto-filled from release) */
  utm_campaign?: string;
  /** Distinguishes different creatives/links (optional) */
  utm_content?: string;
  /** Keywords or audience segments (optional) */
  utm_term?: string;
}

/**
 * Dynamic placeholders that can be used in UTM parameters
 * These are replaced at copy-time with actual values
 */
export type UTMPlaceholder =
  | '{{release_slug}}'
  | '{{release_title}}'
  | '{{artist_name}}'
  | '{{release_date}}'
  | '{{partner_name}}'
  | '{{ad_name}}';

/**
 * A single UTM preset configuration
 */
export interface UTMPreset {
  /** Unique identifier for the preset */
  id: string;
  /** Display label shown in the dropdown */
  label: string;
  /** Optional description for tooltips/help text */
  description?: string;
  /** The UTM parameters this preset applies */
  params: UTMParams;
  /** Icon name from Lucide (optional) */
  icon?: string;
  /** Keyboard shortcut hint (optional) */
  shortcut?: string;
}

/**
 * A category of related UTM presets
 */
export interface UTMPresetCategory {
  /** Unique identifier for the category */
  id: string;
  /** Display label for the category */
  label: string;
  /** Icon name from Lucide */
  icon: string;
  /** Presets within this category */
  presets: UTMPreset[];
}

/**
 * User's saved UTM template
 */
export interface UTMTemplate {
  /** Unique identifier */
  id: string;
  /** User-defined template name */
  name: string;
  /** Optional description */
  description?: string;
  /** The UTM parameters */
  params: UTMParams;
  /** Creation timestamp */
  createdAt: string;
  /** Last modification timestamp */
  updatedAt: string;
  /** Number of times this template has been used */
  usageCount: number;
  /** Last time this template was used */
  lastUsedAt?: string;
  /** User-defined category/tag */
  category?: string;
  /** Visual identifier color (hex) */
  color?: string;
  /** Whether to show at top of template list */
  isPinned?: boolean;
}

/**
 * Usage tracking record for a preset/template
 */
export interface UTMUsageRecord {
  /** Preset or template ID */
  presetId: string;
  /** Total number of uses */
  count: number;
  /** Last used timestamp (ms since epoch) */
  lastUsed: number;
  /** Context IDs where this was used (release IDs, etc.) */
  contexts: string[];
}

/**
 * Aggregated usage data stored locally
 */
export interface UTMUsageData {
  /** Version for migration purposes */
  version: number;
  /** Usage records keyed by preset/template ID */
  records: Record<string, UTMUsageRecord>;
  /** Last updated timestamp */
  updatedAt: number;
}

/**
 * Context passed to UTM builder for placeholder resolution
 */
export interface UTMContext {
  /** Release slug for utm_campaign default */
  releaseSlug?: string;
  /** Release title */
  releaseTitle?: string;
  /** Artist/creator name */
  artistName?: string;
  /** Release date in ISO format */
  releaseDate?: string;
  /** Base URL for the link */
  baseUrl: string;
}

/**
 * Options for building a UTM URL
 */
export interface UTMBuildOptions {
  /** The base URL to append UTM params to */
  url: string;
  /** UTM parameters to apply */
  params: UTMParams;
  /** Context for placeholder resolution */
  context?: Partial<UTMContext>;
  /** Whether to include empty params (default: false) */
  includeEmpty?: boolean;
}

/**
 * Result from building a UTM URL
 */
export interface UTMBuildResult {
  /** The full URL with UTM parameters */
  url: string;
  /** The UTM parameters that were applied (resolved, no placeholders) */
  resolvedParams: UTMParams;
  /** Whether any placeholders were unresolved */
  hasUnresolvedPlaceholders: boolean;
}

/**
 * Analytics event types for UTM tracking
 */
export type UTMAnalyticsEvent =
  | 'utm_dropdown_open'
  | 'utm_submenu_open'
  | 'utm_search_query'
  | 'utm_preset_select'
  | 'utm_custom_open'
  | 'utm_custom_copy'
  | 'utm_template_save'
  | 'utm_template_use';

/**
 * Properties for UTM analytics events
 */
export interface UTMAnalyticsEventProperties {
  utm_dropdown_open: {
    releaseId?: string;
    source: string;
  };
  utm_submenu_open: {
    category: string;
  };
  utm_search_query: {
    query: string;
    resultCount: number;
  };
  utm_preset_select: {
    presetId: string;
    category: string;
    wasSearched: boolean;
    position: number;
    timeToSelect: number;
  };
  utm_custom_open: Record<string, never>;
  utm_custom_copy: UTMParams;
  utm_template_save: {
    templateName: string;
  };
  utm_template_use: {
    templateId: string;
  };
}

/**
 * Sort options for presets/templates
 */
export type UTMSortOption = 'popular' | 'recent' | 'alphabetical';

/**
 * Configuration for the UTM dropdown behavior
 */
export interface UTMDropdownConfig {
  /** Default copy behavior when clicking main button */
  defaultCopyBehavior: 'plain' | 'preset' | 'menu';
  /** Default preset to use when defaultCopyBehavior is 'preset' */
  defaultPresetId?: string;
  /** Campaign name format */
  campaignFormat: 'slug' | 'title' | 'custom';
  /** Custom campaign prefix (used when campaignFormat is 'custom') */
  customCampaignPrefix?: string;
}
