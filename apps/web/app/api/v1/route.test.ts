import { describe, expect, it } from 'vitest';
import {
  PUBLIC_ARTIST_API_COMMON_HEADERS,
  PUBLIC_ARTIST_API_DISCOVERY_CACHE_CONTROL,
  PUBLIC_ARTIST_API_INDEX,
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
    expect(response.headers.get('RateLimit-Policy')).toBeNull();
    expect(response.headers.get('RateLimit')).toBeNull();

    const body = await response.json();
    expect(body).toEqual(PUBLIC_ARTIST_API_INDEX);
    expect(body.access).toBe('anonymous');
    expect(body.scope).toBe('read-only');
    expect(body).not.toHaveProperty('rateLimit');
    expect(body).not.toHaveProperty('artists');
  });
});
