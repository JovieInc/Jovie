import { describe, expect, it } from 'vitest';

/**
 * Tests for the chat title generation logic.
 *
 * The actual `maybeGenerateTitle` function is a server-side function in the
 * messages route that calls the AI gateway. We test the pure logic aspects:
 * - Title cleanup (quote stripping, truncation)
 * - Fallback title generation
 * - titlePending flag logic
 */

describe('title cleanup logic', () => {
  // Mirrors the cleanup in maybeGenerateTitle
  function cleanTitle(text: string): string {
    return text
      .trim()
      .replace(/^["']|["']$/g, '')
      .slice(0, 80);
  }

  it('trims whitespace from generated title', () => {
    expect(cleanTitle('  Profile Review  ')).toBe('Profile Review');
  });

  it('strips leading and trailing quotes', () => {
    expect(cleanTitle('"Profile Review"')).toBe('Profile Review');
    expect(cleanTitle("'Profile Review'")).toBe('Profile Review');
  });

  it('truncates titles longer than 80 characters', () => {
    const longTitle = 'A'.repeat(100);
    expect(cleanTitle(longTitle)).toHaveLength(80);
  });

  it('handles empty string', () => {
    expect(cleanTitle('')).toBe('');
  });

  it('handles title with only quotes', () => {
    expect(cleanTitle('""')).toBe('');
  });

  it('preserves internal quotes', () => {
    expect(cleanTitle('What\'s "working" best')).toBe('What\'s "working" best');
  });
});

describe('fallback title generation', () => {
  // Mirrors the fallback logic in maybeGenerateTitle
  function generateFallbackTitle(content: string): string | null {
    const raw = content.trim();
    if (!raw) return null;
    const fallback = raw.slice(0, 50);
    const suffix = raw.length > 50 ? '...' : '';
    return fallback + suffix;
  }

  it('uses first 50 characters of user message', () => {
    const message = 'Review my profile and suggest improvements for my career';
    const title = generateFallbackTitle(message);
    expect(title).toBe('Review my profile and suggest improvements for my ...');
    expect(title!.length).toBeLessThanOrEqual(53); // 50 + "..."
  });

  it('does not add ellipsis for short messages', () => {
    const message = 'Help me grow';
    expect(generateFallbackTitle(message)).toBe('Help me grow');
  });

  it('returns null for empty content', () => {
    expect(generateFallbackTitle('')).toBeNull();
    expect(generateFallbackTitle('   ')).toBeNull();
  });

  it('trims whitespace before generating fallback', () => {
    expect(generateFallbackTitle('  Hello world  ')).toBe('Hello world');
  });
});

describe('titlePending flag logic', () => {
  // Mirrors the logic in the POST handler
  function shouldGenerateTitle(
    hasUserMessage: boolean,
    existingTitle: string | null
  ): boolean {
    return hasUserMessage && !existingTitle;
  }

  it('returns true when first user message and no title', () => {
    expect(shouldGenerateTitle(true, null)).toBe(true);
  });

  it('returns false when title already exists', () => {
    expect(shouldGenerateTitle(true, 'Existing Title')).toBe(false);
  });

  it('returns false when no user message', () => {
    expect(shouldGenerateTitle(false, null)).toBe(false);
  });

  it('returns false when only assistant messages and no title', () => {
    expect(shouldGenerateTitle(false, null)).toBe(false);
  });
});
