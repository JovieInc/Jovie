import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/providers/ResolvedClientProviders', () => ({
  ResolvedClientProviders: () => null,
}));

import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';
import { metadata } from './layout';

describe('waitlist layout metadata', () => {
  it('keeps /waitlist and /waitlist/invite out of search with a real title', () => {
    expect(metadata.robots).toEqual(NOINDEX_ROBOTS);
    expect(metadata.title).toBe('Join the waitlist');
  });
});
