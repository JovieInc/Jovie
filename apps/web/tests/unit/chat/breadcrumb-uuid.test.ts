import { describe, expect, it } from 'vitest';
import { getBreadcrumbLabel } from '@/lib/constants/breadcrumb-labels';

describe('getBreadcrumbLabel', () => {
  it('returns "New thread" for the chat segment', () => {
    expect(getBreadcrumbLabel('chat')).toBe('New thread');
  });

  it('returns "Dashboard" for the dashboard segment', () => {
    expect(getBreadcrumbLabel('dashboard')).toBe('Dashboard');
  });

  it('converts unknown kebab-case to sentence case', () => {
    expect(getBreadcrumbLabel('some-route')).toBe('Some route');
  });

  it('returns empty string for empty segment', () => {
    expect(getBreadcrumbLabel('')).toBe('');
  });
});

/**
 * UUID regex used in useAuthRouteConfig to detect dynamic route segments.
 * Validate the regex catches standard UUIDs and rejects non-UUIDs.
 */
describe('UUID regex for breadcrumb route segments', () => {
  const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  it('matches a valid UUID', () => {
    expect(UUID_REGEX.test('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('matches uppercase UUIDs', () => {
    expect(UUID_REGEX.test('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
  });

  it('does not match "chat"', () => {
    expect(UUID_REGEX.test('chat')).toBe(false);
  });

  it('does not match "dashboard"', () => {
    expect(UUID_REGEX.test('dashboard')).toBe(false);
  });

  it('does not match partial UUIDs', () => {
    expect(UUID_REGEX.test('550e8400-e29b-41d4')).toBe(false);
  });

  it('does not match UUIDs without dashes', () => {
    expect(UUID_REGEX.test('550e8400e29b41d4a716446655440000')).toBe(false);
  });
});
