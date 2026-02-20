import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAuthenticatedCorsHeaders } from '@/lib/http/headers';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('createAuthenticatedCorsHeaders', () => {
  it('returns strict headers for allowed production origin', () => {
    const headers = createAuthenticatedCorsHeaders('https://app.jovie.fm');

    expect(headers).toEqual({
      'Access-Control-Allow-Origin': 'https://app.jovie.fm',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    });
  });

  it('allows vercel preview deployment origins', () => {
    const headers = createAuthenticatedCorsHeaders(
      'https://jovie-git-feature-123-jovie.vercel.app',
      'GET, OPTIONS'
    );

    expect(headers['Access-Control-Allow-Origin']).toBe(
      'https://jovie-git-feature-123-jovie.vercel.app'
    );
    expect(headers['Access-Control-Allow-Methods']).toBe('GET, OPTIONS');
  });

  it('allows localhost origins in development mode', () => {
    vi.stubEnv('NODE_ENV', 'development');

    const headers = createAuthenticatedCorsHeaders('http://localhost:3000');

    expect(headers['Access-Control-Allow-Origin']).toBe(
      'http://localhost:3000'
    );
  });

  it('returns no CORS headers for non-allowlisted origins', () => {
    const headers = createAuthenticatedCorsHeaders('https://evil.example');

    expect(headers).toEqual({});
  });

  it('returns no CORS headers when request has no origin', () => {
    const headers = createAuthenticatedCorsHeaders(null);

    expect(headers).toEqual({});
  });
});
