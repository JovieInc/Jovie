import 'server-only';

import { z } from 'zod';
import { canonicalizeSurfaceUrl } from '@/lib/profile-surfaces/contracts';
import {
  type ProfileSearchProvider,
  ProfileSearchProviderError,
  type ProfileSearchRequest,
  type ProfileSearchResponse,
} from './provider';

const REQUEST_TIMEOUT_MS = 10_000;
const REQUEST_SCHEMA = z.object({
  query: z.string().trim().min(1).max(120),
  market: z.string().regex(/^[A-Z]{2}$/),
  locale: z.literal('en'),
  device: z.literal('desktop'),
  limit: z.literal(10),
});
const RESPONSE_SCHEMA = z.object({
  search_metadata: z
    .object({
      id: z.string().max(200).optional(),
      total_time_taken: z.number().nonnegative().optional(),
    })
    .passthrough()
    .optional(),
  organic_results: z
    .array(
      z.object({
        position: z.number().int().min(1).max(10),
        title: z.string().min(1).max(500),
        snippet: z.string().max(2_000).optional(),
        link: z.string().url().max(2_048),
      })
    )
    .max(10)
    .default([]),
  error: z.string().max(1_000).optional(),
});

interface GoogleSerpApiProviderOptions {
  readonly apiKey?: string;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => Date;
}

export class GoogleSerpApiProvider implements ProfileSearchProvider {
  readonly id = 'google_serpapi';
  private readonly apiKey: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(options: GoogleSerpApiProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.SERPAPI_API_KEY;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  async search(
    rawRequest: ProfileSearchRequest
  ): Promise<ProfileSearchResponse> {
    const parsedRequest = REQUEST_SCHEMA.safeParse(rawRequest);
    if (!parsedRequest.success) {
      throw new ProfileSearchProviderError(
        'Invalid profile search request',
        'invalid_request',
        false
      );
    }
    if (!this.apiKey) {
      throw new ProfileSearchProviderError(
        'Google search provider is not configured',
        'not_configured',
        false
      );
    }

    const request = parsedRequest.data;
    const url = new URL('https://serpapi.com/search.json');
    url.search = new URLSearchParams({
      api_key: this.apiKey,
      engine: 'google',
      q: request.query,
      gl: request.market.toLowerCase(),
      hl: request.locale,
      device: request.device,
      num: String(request.limit),
      safe: 'active',
    }).toString();

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'GET',
        cache: 'no-store',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const timedOut =
        error instanceof DOMException && error.name === 'TimeoutError';
      throw new ProfileSearchProviderError(
        timedOut ? 'Google search provider timed out' : 'Google search failed',
        timedOut ? 'timeout' : 'upstream',
        true
      );
    }

    if (!response.ok) {
      const quota = response.status === 429;
      throw new ProfileSearchProviderError(
        quota
          ? 'Google search provider quota exhausted'
          : 'Google search failed',
        quota ? 'quota' : 'upstream',
        response.status >= 500
      );
    }

    const payload = RESPONSE_SCHEMA.safeParse(await response.json());
    if (!payload.success || payload.data.error) {
      throw new ProfileSearchProviderError(
        'Google search provider returned an invalid response',
        'invalid_response',
        false
      );
    }

    const organicResults = payload.data.organic_results.map(result => {
      const canonical = canonicalizeSurfaceUrl(result.link);
      if (!canonical) {
        throw new ProfileSearchProviderError(
          'Google search provider returned an unsafe result URL',
          'invalid_response',
          false
        );
      }
      return {
        position: result.position,
        title: result.title,
        snippet: result.snippet ?? null,
        url: result.link,
        normalizedUrl: canonical.url,
      };
    });

    return {
      provider: this.id,
      fetchedAt: this.now(),
      request,
      organicResults,
      usage: {
        searchId: payload.data.search_metadata?.id,
        providerLatencySeconds: payload.data.search_metadata?.total_time_taken,
      },
    };
  }
}
