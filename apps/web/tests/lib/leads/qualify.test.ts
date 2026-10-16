import { afterEach, describe, expect, it, vi } from 'vitest';
import { qualifyLead } from '@/lib/leads/qualify';

afterEach(() => vi.unstubAllGlobals());

describe('Linktree qualification', () => {
  it.each([undefined, { includePrivateContact: false }])(
    'requires an official API without fetching HTML (%j)',
    async options => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      await expect(
        qualifyLead('https://linktr.ee/artist', options)
      ).rejects.toMatchObject({
        code: 'SOCIAL_HTML_DISABLED',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it('rejects invalid URLs', async () => {
    await expect(
      qualifyLead('https://example.com/artist')
    ).rejects.toMatchObject({
      code: 'INVALID_URL',
    });
  });
});
