/**
 * UTM URL Builder Utilities
 *
 * Functions for building URLs with UTM parameters and resolving placeholders.
 */

import type {
  UTMBuildOptions,
  UTMBuildResult,
  UTMContext,
  UTMParams,
  UTMPlaceholder,
} from './types';

/**
 * Pattern to match UTM placeholders like {{release_slug}}
 */
const PLACEHOLDER_PATTERN = /\{\{([a-z_]+)\}\}/g;

/**
 * Map placeholder names to context property names
 */
const PLACEHOLDER_TO_CONTEXT: Record<string, keyof UTMContext> = {
  release_slug: 'releaseSlug',
  release_title: 'releaseTitle',
  artist_name: 'artistName',
  release_date: 'releaseDate',
};

/**
 * Resolve a single placeholder value from context
 */
function resolvePlaceholder(
  placeholder: UTMPlaceholder,
  context: Partial<UTMContext>
): string | undefined {
  // Extract the key from {{key}} format
  const key = placeholder.replace(/\{\{|\}\}/g, '');
  const contextKey = PLACEHOLDER_TO_CONTEXT[key];

  if (contextKey && contextKey in context) {
    const value = context[contextKey];
    return typeof value === 'string' ? value : undefined;
  }

  return undefined;
}

/**
 * Resolve all placeholders in a string
 * Returns the resolved string and whether any placeholders were unresolved
 */
function resolveString(
  value: string,
  context: Partial<UTMContext>
): { resolved: string; hasUnresolved: boolean } {
  let hasUnresolved = false;

  const resolved = value.replace(PLACEHOLDER_PATTERN, match => {
    const replacement = resolvePlaceholder(match as UTMPlaceholder, context);
    if (replacement === undefined) {
      hasUnresolved = true;
      return match; // Keep original placeholder if unresolved
    }
    return replacement;
  });

  return { resolved, hasUnresolved };
}

/**
 * Resolve all placeholders in UTM params
 */
export function resolveUTMParams(
  params: UTMParams,
  context: Partial<UTMContext>
): { resolvedParams: UTMParams; hasUnresolvedPlaceholders: boolean } {
  let hasUnresolvedPlaceholders = false;

  const resolveParam = (value: string | undefined): string | undefined => {
    if (!value) return value;
    const { resolved, hasUnresolved } = resolveString(value, context);
    if (hasUnresolved) hasUnresolvedPlaceholders = true;
    return resolved;
  };

  const resolvedParams: UTMParams = {
    utm_source: resolveParam(params.utm_source) ?? params.utm_source,
    utm_medium: resolveParam(params.utm_medium) ?? params.utm_medium,
    utm_campaign: resolveParam(params.utm_campaign),
    utm_content: resolveParam(params.utm_content),
    utm_term: resolveParam(params.utm_term),
  };

  return { resolvedParams, hasUnresolvedPlaceholders };
}

/**
 * Convert a string to URL-safe slug format
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove non-word chars except spaces and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/(?:^-+)|(?:-+$)/g, ''); // Trim hyphens from start and end
}

/**
 * Build a URL with UTM parameters
 *
 * @example
 * ```ts
 * const result = buildUTMUrl({
 *   url: 'https://example.com/release',
 *   params: {
 *     utm_source: 'instagram',
 *     utm_medium: 'social',
 *     utm_campaign: '{{release_slug}}',
 *     utm_content: 'story',
 *   },
 *   context: { releaseSlug: 'my-new-single' },
 * });
 * // result.url = 'https://example.com/release?utm_source=instagram&utm_medium=social&utm_campaign=my-new-single&utm_content=story'
 * ```
 */
export function buildUTMUrl(options: UTMBuildOptions): UTMBuildResult {
  const { url, params, context = {}, includeEmpty = false } = options;

  // Resolve placeholders
  const { resolvedParams, hasUnresolvedPlaceholders } = resolveUTMParams(
    params,
    context
  );

  // Build URL
  const urlObj = new URL(url);

  // Add UTM parameters in standard order
  const paramOrder: (keyof UTMParams)[] = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_content',
    'utm_term',
  ];

  for (const key of paramOrder) {
    const value = resolvedParams[key];
    if (value || includeEmpty) {
      if (value) {
        urlObj.searchParams.set(key, value);
      }
    }
  }

  return {
    url: urlObj.toString(),
    resolvedParams,
    hasUnresolvedPlaceholders,
  };
}

/**
 * Build a URL string with UTM parameters (convenience function)
 * Returns just the URL string, throws if there are unresolved placeholders
 */
export function buildUTMUrlString(options: UTMBuildOptions): string {
  const result = buildUTMUrl(options);

  if (result.hasUnresolvedPlaceholders) {
    console.warn(
      '[UTM] Some placeholders could not be resolved:',
      options.params
    );
  }

  return result.url;
}

/**
 * Parse UTM parameters from a URL
 */
export function parseUTMParams(url: string): Partial<UTMParams> {
  try {
    const urlObj = new URL(url);
    return {
      utm_source: urlObj.searchParams.get('utm_source') ?? undefined,
      utm_medium: urlObj.searchParams.get('utm_medium') ?? undefined,
      utm_campaign: urlObj.searchParams.get('utm_campaign') ?? undefined,
      utm_content: urlObj.searchParams.get('utm_content') ?? undefined,
      utm_term: urlObj.searchParams.get('utm_term') ?? undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Check if a URL already has UTM parameters
 */
export function hasUTMParams(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return (
      urlObj.searchParams.has('utm_source') ||
      urlObj.searchParams.has('utm_medium') ||
      urlObj.searchParams.has('utm_campaign')
    );
  } catch {
    return false;
  }
}

/**
 * Strip UTM parameters from a URL
 */
export function stripUTMParams(url: string): string {
  try {
    const urlObj = new URL(url);
    urlObj.searchParams.delete('utm_source');
    urlObj.searchParams.delete('utm_medium');
    urlObj.searchParams.delete('utm_campaign');
    urlObj.searchParams.delete('utm_content');
    urlObj.searchParams.delete('utm_term');
    return urlObj.toString();
  } catch {
    return url;
  }
}

/**
 * Validate UTM parameters
 * Returns an object with validation errors (empty if valid)
 */
export function validateUTMParams(
  params: Partial<UTMParams>
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!params.utm_source?.trim()) {
    errors.utm_source = 'Source is required';
  } else if (params.utm_source.length > 100) {
    errors.utm_source = 'Source must be 100 characters or less';
  } else if (!/^[a-zA-Z0-9_-]+$/.test(params.utm_source)) {
    errors.utm_source =
      'Source can only contain letters, numbers, underscores, and hyphens';
  }

  if (!params.utm_medium?.trim()) {
    errors.utm_medium = 'Medium is required';
  } else if (params.utm_medium.length > 100) {
    errors.utm_medium = 'Medium must be 100 characters or less';
  } else if (!/^[a-zA-Z0-9_-]+$/.test(params.utm_medium)) {
    errors.utm_medium =
      'Medium can only contain letters, numbers, underscores, and hyphens';
  }

  if (params.utm_campaign && params.utm_campaign.length > 200) {
    errors.utm_campaign = 'Campaign must be 200 characters or less';
  }

  if (params.utm_content && params.utm_content.length > 200) {
    errors.utm_content = 'Content must be 200 characters or less';
  }

  if (params.utm_term && params.utm_term.length > 200) {
    errors.utm_term = 'Term must be 200 characters or less';
  }

  return errors;
}

/**
 * Format UTM params for display (human-readable)
 */
export function formatUTMParamsForDisplay(params: UTMParams): string {
  const parts: string[] = [];

  if (params.utm_source) parts.push(`source: ${params.utm_source}`);
  if (params.utm_medium) parts.push(`medium: ${params.utm_medium}`);
  if (params.utm_campaign) parts.push(`campaign: ${params.utm_campaign}`);
  if (params.utm_content) parts.push(`content: ${params.utm_content}`);
  if (params.utm_term) parts.push(`term: ${params.utm_term}`);

  return parts.join(' · ');
}

/**
 * Create UTM params from simple source/medium
 */
export function createSimpleUTMParams(
  source: string,
  medium: string,
  campaign?: string
): UTMParams {
  return {
    utm_source: source.toLowerCase().replace(/\s+/g, '_'),
    utm_medium: medium.toLowerCase().replace(/\s+/g, '_'),
    utm_campaign: campaign,
  };
}
