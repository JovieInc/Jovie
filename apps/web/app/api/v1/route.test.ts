import { describe, expect, it } from 'vitest';
import {
  PUBLIC_ARTIST_API_COMMON_HEADERS,
  PUBLIC_ARTIST_API_DISCOVERY_CACHE_CONTROL,
  PUBLIC_ARTIST_API_INDEX,
  PUBLIC_ARTIST_API_POLICY_LINK,
} from '@/lib/api/v1/contract';
import { GET } from './route';

describe('GET /api/v1', () => {
  it('returns a stable non-enumerating capability document', async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe(
      PUBLIC_ARTIST_API_DISCOVERY_CACHE_CONTROL
    );
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
      PUBLIC_ARTIST_API_COMMON_HEADERS['Access-Control-Allow-Origin']
    );
    expect(response.headers.get('Link')).toBe(PUBLIC_ARTIST_API_POLICY_LINK);
    expect(response.headers.get('RateLimit-Policy')).toBeNull();
    expect(response.headers.get('RateLimit')).toBeNull();

    const body = await response.json();
    expect(body).toEqual(PUBLIC_ARTIST_API_INDEX);
    expect(body.access).toBe('anonymous');
    expect(body.scope).toBe('read-only');
    expect(body.rateLimit).toEqual({
      appliesTo: 'artist-profile',
      policy: 'public-artist',
      limit: 100,
      windowSeconds: 60,
      key: 'client-ip',
    });
    expect(body).not.toHaveProperty('artists');
  });
});
