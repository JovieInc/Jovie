'use client';

/**
 * useChatMode Hook
 *
 * Detects whether user input should be handled as:
 * - 'url': A link to add (contains URL patterns)
 * - 'platform': A platform name/search (short text, matches platform names)
 * - 'chat': A question or command for Jovie AI
 */

import { useMemo } from 'react';
import { PLATFORM_OPTIONS } from '../universalLinkInput.constants';
import { fuzzyMatch, looksLikeUrlOrDomain, normalizeQuery } from './utils';

export type InputMode = 'url' | 'platform' | 'chat';

/** Minimum length before we consider something might be chat */
const MIN_CHAT_LENGTH = 3;

/** Question words that strongly indicate chat intent */
const QUESTION_STARTERS = new Set([
  'what',
  'how',
  'why',
  'when',
  'where',
  'who',
  'which',
  'can',
  'could',
  'would',
  'should',
  'is',
  'are',
  'do',
  'does',
  'will',
  'help',
  'tell',
  'show',
  'explain',
  'describe',
]);

/** Action words that indicate profile editing intent (still chat mode) */
const ACTION_STARTERS = new Set([
  'update',
  'change',
  'set',
  'edit',
  'modify',
  'make',
  'add',
  'remove',
  'delete',
]);

/**
 * Check if input starts with a question or action word
 */
function startsWithChatIntent(input: string): boolean {
  const normalized = normalizeQuery(input);
  const firstWord = normalized.split(' ')[0];
  return (
    QUESTION_STARTERS.has(firstWord) || ACTION_STARTERS.has(firstWord)
  );
}

/**
 * Check if input ends with a question mark
 */
function endsWithQuestion(input: string): boolean {
  return input.trim().endsWith('?');
}

/**
 * Check if input looks like it's searching for a platform
 * Returns true if input fuzzy-matches any platform name well
 */
function matchesPlatformName(input: string): boolean {
  const normalized = normalizeQuery(input);
  if (normalized.length < 2) return true; // Too short, show platform suggestions

  // Check if any platform has a good fuzzy match
  for (const platform of PLATFORM_OPTIONS) {
    const nameMatch = fuzzyMatch(normalized, platform.name);
    const idMatch = fuzzyMatch(normalized, platform.id.replaceAll('-', ' '));

    // High score threshold - must be a good match
    if ((nameMatch && nameMatch.score > 3) || (idMatch && idMatch.score > 3)) {
      return true;
    }
  }

  return false;
}

interface UseChatModeOptions {
  /** Current input value */
  input: string;
  /** Whether chat mode is enabled (default: true) */
  chatEnabled?: boolean;
}

interface UseChatModeResult {
  /** Detected input mode */
  mode: InputMode;
  /** Whether input should be sent to chat */
  isChat: boolean;
  /** Whether input looks like a URL */
  isUrl: boolean;
  /** Whether input looks like a platform search */
  isPlatform: boolean;
}

/**
 * Hook to detect the input mode for UniversalLinkInput
 *
 * Detection priority:
 * 1. URLs (contains dots, slashes, http prefix) → 'url'
 * 2. Very short input (< 3 chars) → 'platform' (show suggestions)
 * 3. Starts with question/action word OR ends with ? → 'chat'
 * 4. Matches platform name → 'platform'
 * 5. Default → 'chat'
 */
export function useChatMode({
  input,
  chatEnabled = true,
}: UseChatModeOptions): UseChatModeResult {
  return useMemo(() => {
    const trimmed = input.trim();

    // Empty input - default to platform mode (show suggestions on focus)
    if (!trimmed) {
      return {
        mode: 'platform' as const,
        isChat: false,
        isUrl: false,
        isPlatform: true,
      };
    }

    // Check for URL patterns first
    if (looksLikeUrlOrDomain(trimmed)) {
      return {
        mode: 'url' as const,
        isChat: false,
        isUrl: true,
        isPlatform: false,
      };
    }

    // Very short input - show platform suggestions
    if (trimmed.length < MIN_CHAT_LENGTH) {
      return {
        mode: 'platform' as const,
        isChat: false,
        isUrl: false,
        isPlatform: true,
      };
    }

    // Chat mode disabled - treat everything else as platform search
    if (!chatEnabled) {
      return {
        mode: 'platform' as const,
        isChat: false,
        isUrl: false,
        isPlatform: true,
      };
    }

    // Check for explicit chat signals
    const hasQuestionMark = endsWithQuestion(trimmed);
    const hasChatIntent = startsWithChatIntent(trimmed);

    if (hasQuestionMark || hasChatIntent) {
      return {
        mode: 'chat' as const,
        isChat: true,
        isUrl: false,
        isPlatform: false,
      };
    }

    // Check if it matches a platform name
    if (matchesPlatformName(trimmed)) {
      return {
        mode: 'platform' as const,
        isChat: false,
        isUrl: false,
        isPlatform: true,
      };
    }

    // Default to chat for longer unrecognized input
    return {
      mode: 'chat' as const,
      isChat: true,
      isUrl: false,
      isPlatform: false,
    };
  }, [input, chatEnabled]);
}
