import { describe, expect, it } from 'vitest';
import { resolveLibraryShareExpiryIso } from '@/lib/library-share/expiry';

describe('resolveLibraryShareExpiryIso', () => {
  const now = Date.parse('2026-06-10T12:00:00.000Z');

  it('returns null when the drop never expires', () => {
    expect(resolveLibraryShareExpiryIso('never', now)).toBeNull();
  });

  it('returns an ISO timestamp for preset windows', () => {
    expect(resolveLibraryShareExpiryIso('7d', now)).toBe(
      '2026-06-17T12:00:00.000Z'
    );
    expect(resolveLibraryShareExpiryIso('30d', now)).toBe(
      '2026-07-10T12:00:00.000Z'
    );
    expect(resolveLibraryShareExpiryIso('90d', now)).toBe(
      '2026-09-08T12:00:00.000Z'
    );
  });
});
