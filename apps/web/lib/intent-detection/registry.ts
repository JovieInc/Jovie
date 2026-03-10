/**
 * Intent Pattern Registry
 * Ordered regex patterns for deterministic intent classification.
 * Patterns are sorted by priority (highest first), then by specificity.
 */

import { IntentCategory, type IntentPattern } from './types';

/**
 * All known platform names for link add/remove matching.
 * Kept in sync with platform-detection registry.
 */
const PLATFORM_NAMES =
  'instagram|twitter|x|tiktok|youtube|spotify|soundcloud|bandcamp|facebook|linkedin|twitch|discord|patreon|apple\\s*music|amazon\\s*music|tidal|deezer|snapchat|pinterest|reddit|venmo|paypal|cashapp|ko-?fi|buymeacoffee|telegram|whatsapp|substack|medium|github|behance|dribbble|threads';

const platformPattern = new RegExp(`(${PLATFORM_NAMES})`, 'i');

function extractValue(match: RegExpMatchArray): Record<string, string> {
  return { value: match[1].trim() };
}

function extractPlatform(match: RegExpMatchArray): Record<string, string> {
  return { platform: match[1].trim().toLowerCase() };
}

function extractSetting(match: RegExpMatchArray): Record<string, string> {
  return { setting: match[1].trim().toLowerCase() };
}

function extractNothing(): Record<string, string> {
  return {};
}

export const INTENT_PATTERNS: IntentPattern[] = [
  // --- Priority 10: Profile name changes ---
  {
    category: IntentCategory.PROFILE_UPDATE_NAME,
    pattern:
      /^(?:change|update|set|edit|make|rename)\s+(?:my\s+)?(?:display\s*name|name|artist\s*name)\s+(?:to|:|=)\s*(.+)/i,
    extract: extractValue,
    priority: 10,
  },
  {
    category: IntentCategory.PROFILE_UPDATE_NAME,
    pattern:
      /^(?:my\s+)?(?:display\s*name|name|artist\s*name)\s+(?:should\s+be|is)\s+(.+)/i,
    extract: extractValue,
    priority: 10,
  },

  // --- Priority 10: Profile bio changes ---
  {
    category: IntentCategory.PROFILE_UPDATE_BIO,
    pattern:
      /^(?:change|update|set|edit|make)\s+(?:my\s+)?bio\s+(?:to|:|=)\s*(.+)/is,
    extract: extractValue,
    priority: 10,
  },
  {
    category: IntentCategory.PROFILE_UPDATE_BIO,
    pattern: /^(?:my\s+)?bio\s+(?:should\s+be|is)\s+(.+)/is,
    extract: extractValue,
    priority: 10,
  },

  // --- Priority 9: Link addition with URL ---
  {
    category: IntentCategory.LINK_ADD,
    pattern: /^(?:add|connect|link|set\s+up)\s+.*?(https?:\/\/\S+)/i,
    extract: (match: RegExpMatchArray) => ({
      platform: '',
      url: match[1].trim(),
    }),
    priority: 9,
  },

  // --- Priority 8: Link addition by platform name (no URL) ---
  {
    category: IntentCategory.LINK_ADD,
    pattern: new RegExp(
      `^(?:add|connect|link|set\\s+up)\\s+(?:my\\s+)?${platformPattern.source}(?:\\s+(?:link|url|account|page|profile))?`,
      'i'
    ),
    extract: extractPlatform,
    priority: 8,
  },

  // --- Priority 8: Link removal ---
  {
    category: IntentCategory.LINK_REMOVE,
    pattern: new RegExp(
      `^(?:remove|delete|disconnect|unlink)\\s+(?:my\\s+)?${platformPattern.source}(?:\\s+(?:link|url|account|page|profile))?`,
      'i'
    ),
    extract: extractPlatform,
    priority: 8,
  },

  // --- Priority 7: Avatar upload ---
  {
    category: IntentCategory.AVATAR_UPLOAD,
    pattern:
      /^(?:upload|change|update|set)\s+(?:my\s+)?(?:photo|avatar|picture|profile\s*pic(?:ture)?|pfp|image|headshot)/i,
    extract: extractNothing,
    priority: 7,
  },

  // --- Priority 5: Settings toggles ---
  {
    category: IntentCategory.SETTINGS_TOGGLE,
    pattern: /^(?:enable|disable|turn\s+(?:on|off)|toggle)\s+(?:my\s+)?(.+)/i,
    extract: extractSetting,
    priority: 5,
  },
].sort((a, b) => b.priority - a.priority);
