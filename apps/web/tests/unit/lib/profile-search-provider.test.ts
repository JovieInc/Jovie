import { describe, expect, it, vi } from 'vitest';
import { GoogleSerpApiProvider } from '@/lib/profile-search/google-serpapi';
import { ProfileSearchProviderError } from '@/lib/profile-search/provider';

const request = {
  query: 'Tim White',
  market: 'US',
  locale: 'en',
  device: 'desktop',
  limit: 10,
} as const;

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('GoogleSerpApiProvider', () => {
  it('validates and normalizes a bounded top-ten response', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        search_metadata: { id: 'search-1', total_time_taken: 0.4 },
        organic_results: [
          {
            position: 1,
            title: 'Tim White | Jovie',
            link: 'https://jov.ie/tim/?utm_source=google',
            snippet: 'Official artist profile',
          },
        ],
      })
    );
    const provider = new GoogleSerpApiProvider({
      apiKey: 'test-key',
      fetchImpl,
      now: () => new Date('2026-07-16T00:00:00.000Z'),
    });

    const response = await provider.search(request);

    expect(response.organicResults).toEqual([
      {
        position: 1,
        title: 'Tim White | Jovie',
        snippet: 'Official artist profile',
        url: 'https://jov.ie/tim/?utm_source=google',
        normalizedUrl: 'https://jov.ie/tim',
      },
    ]);
    const calledUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(calledUrl.origin + calledUrl.pathname).toBe(
      'https://serpapi.com/search.json'
    );
    expect(Object.fromEntries(calledUrl.searchParams)).toMatchObject({
      engine: 'google',
      q: 'Tim White',
      gl: 'us',
      hl: 'en',
      device: 'desktop',
      num: '10',
    });
  });

  it('fails closed when the credential is missing', async () => {
    const provider = new GoogleSerpApiProvider({ apiKey: '' });
    await expect(provider.search(request)).rejects.toMatchObject({
      code: 'not_configured',
      retryable: false,
    });
  });

  it('rejects invalid requests before issuing a provider call', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const provider = new GoogleSerpApiProvider({
      apiKey: 'test-key',
      fetchImpl,
    });

    await expect(
      provider.search({ ...request, market: 'USA' })
    ).rejects.toBeInstanceOf(ProfileSearchProviderError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('classifies quota errors without exposing request secrets', async () => {
    const provider = new GoogleSerpApiProvider({
      apiKey: 'test-key',
      fetchImpl: vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse({ error: 'quota exhausted' }, 429)),
    });

    await expect(provider.search(request)).rejects.toMatchObject({
      message: 'Google search provider quota exhausted',
      code: 'quota',
      retryable: false,
    });
  });

  it('rejects unsafe or oversized result payloads', async () => {
    const unsafe = new GoogleSerpApiProvider({
      apiKey: 'test-key',
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse({
          organic_results: [
            { position: 1, title: 'Unsafe', link: 'ftp://example.com' },
          ],
        })
      ),
    });
    await expect(unsafe.search(request)).rejects.toMatchObject({
      code: 'invalid_response',
    });

    const oversized = new GoogleSerpApiProvider({
      apiKey: 'test-key',
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse({
          organic_results: Array.from({ length: 11 }, (_, index) => ({
            position: Math.min(index + 1, 10),
            title: `Result ${index}`,
            link: `https://example.com/${index}`,
          })),
        })
      ),
    });
    await expect(oversized.search(request)).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });
});
