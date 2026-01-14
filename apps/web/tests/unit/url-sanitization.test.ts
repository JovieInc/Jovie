import { describe, expect, it } from 'vitest';

/**
 * ReDoS Protection Tests for URL Sanitization
 *
 * These tests verify that URL sanitization regex patterns don't cause
 * catastrophic backtracking (Regular Expression Denial of Service).
 *
 * Related: SonarCloud security hotspot in creator-ingest route
 */

describe('URL Sanitization - ReDoS Protection', () => {
  // This is the safe regex pattern from apps/web/app/api/admin/creator-ingest/route.ts:418
  const sanitizeHandle = (handle: string): string => {
    return handle
      .replace(/^@/, '') // Remove @ prefix
      .replace(/[?#].*/, '') // Remove query strings/fragments (safe: greedy match, no backtracking)
      .toLowerCase();
  };

  it('removes @ prefix from handles', () => {
    expect(sanitizeHandle('@username')).toBe('username');
    expect(sanitizeHandle('username')).toBe('username');
    expect(sanitizeHandle('@@username')).toBe('@username');
  });

  it('removes query strings from URLs', () => {
    expect(sanitizeHandle('username?foo=bar')).toBe('username');
    expect(sanitizeHandle('username?foo=bar&baz=qux')).toBe('username');
    expect(sanitizeHandle('username')).toBe('username');
  });

  it('removes URL fragments', () => {
    expect(sanitizeHandle('username#section')).toBe('username');
    expect(sanitizeHandle('username#section?param=value')).toBe('username');
  });

  it('handles complex URLs efficiently', () => {
    const complexUrls = [
      'user?param=' + 'x'.repeat(1000),
      'user#fragment' + 'y'.repeat(1000),
      'user?' + 'param=value&'.repeat(100),
      'user#' + 'section/'.repeat(100),
    ];

    const start = Date.now();
    complexUrls.forEach(url => {
      const result = sanitizeHandle(url);
      expect(result).toBe('user');
    });
    const duration = Date.now() - start;

    // Should complete in under 50ms even with complex patterns
    expect(duration).toBeLessThan(50);
  });

  it('handles malicious patterns without catastrophic backtracking', () => {
    // These patterns could cause ReDoS with vulnerable regex
    const maliciousPatterns = [
      'user?' + '?'.repeat(100),
      'user#' + '#'.repeat(100),
      'user?' + 'a=b&'.repeat(50) + '?'.repeat(50),
    ];

    const start = Date.now();
    maliciousPatterns.forEach(pattern => {
      const result = sanitizeHandle(pattern);
      expect(result).toMatch(/^user/);
    });
    const duration = Date.now() - start;

    // Should complete in under 50ms
    expect(duration).toBeLessThan(50);
  });

  it('converts to lowercase', () => {
    expect(sanitizeHandle('USERNAME')).toBe('username');
    expect(sanitizeHandle('@MixedCase')).toBe('mixedcase');
    expect(sanitizeHandle('CamelCase?query=1')).toBe('camelcase');
  });

  it('handles edge cases', () => {
    expect(sanitizeHandle('')).toBe('');
    expect(sanitizeHandle('?')).toBe('');
    expect(sanitizeHandle('#')).toBe('');
    expect(sanitizeHandle('@')).toBe('');
    expect(sanitizeHandle('?#')).toBe('');
  });
});
