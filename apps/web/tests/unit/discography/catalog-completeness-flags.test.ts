import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/discography/spotify-import', () => ({
  syncReleasesFromSpotify: vi.fn(),
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

import { isRolledOut } from '@/lib/discography/catalog-completeness';

describe('isRolledOut', () => {
  it('defaults to Tim only', () => {
    expect(isRolledOut(undefined, 'tim')).toBe(true);
    expect(isRolledOut(undefined, 'Tim')).toBe(true);
    expect(isRolledOut(undefined, 'someone')).toBe(false);
  });
  it('accepts a handle list and a fleet-wide star', () => {
    expect(isRolledOut('tim, ava', 'ava')).toBe(true);
    expect(isRolledOut('tim', 'ava')).toBe(false);
    expect(isRolledOut('*', 'anyone')).toBe(true);
    expect(isRolledOut('', 'tim')).toBe(false);
  });
});
