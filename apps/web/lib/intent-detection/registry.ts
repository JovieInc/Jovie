/**
 * Intent Pattern Registry
 * Defines regex patterns for deterministic intent classification.
 * Patterns are sorted by priority (highest first).
 */

import { IntentCategory, type IntentPattern } from './types';

/**
 * All known intent patterns, sorted by priority descending.
 * Higher priority patterns are tested first to avoid ambiguity.
 */
export const INTENT_PATTERNS: IntentPattern[] = [
  {
    category: IntentCategory.PROFILE_UPDATE_NAME,
    pattern:
      /^(?:change|update|set)\s+(?:my\s+)?(?:name|display\s*name)\s+(?:to\s+)?["']?(.+?)["']?\s*$/i,
    extract: (match: RegExpMatchArray) => ({ name: match[1].trim() }),
    priority: 10,
  },
  {
    category: IntentCategory.PROFILE_UPDATE_BIO,
    pattern:
      /^(?:change|update|set)\s+(?:my\s+)?bio\s+(?:to\s+)?["']?(.+?)["']?\s*$/i,
    extract: (match: RegExpMatchArray) => ({ bio: match[1].trim() }),
    priority: 10,
  },
  {
    category: IntentCategory.LINK_ADD,
    pattern:
      /^(?:add|create)\s+(?:a\s+)?(?:link|url)\s+(?:to\s+|for\s+)?(\S+)\s*$/i,
    extract: (match: RegExpMatchArray) => ({ url: match[1].trim() }),
    priority: 10,
  },
  {
    category: IntentCategory.LINK_REMOVE,
    pattern:
      /^(?:remove|delete)\s+(?:the\s+)?(?:link|url)\s+(?:to\s+|for\s+)?(\S+)\s*$/i,
    extract: (match: RegExpMatchArray) => ({ url: match[1].trim() }),
    priority: 10,
  },
].sort((a, b) => b.priority - a.priority);
