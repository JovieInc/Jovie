import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/og', () => ({
  ImageResponse: class MockImageResponse {
    headers = new Headers();
    body = null;
    constructor(
      public element: unknown,
      public options?: { headers?: Record<string, string> }
    ) {
      for (const [key, value] of Object.entries(options?.headers ?? {})) {
        this.headers.set(key, value);
      }
    }
  },
}));

vi.mock('@/lib/services/profile', () => ({
  getProfileWithLinks: vi.fn(),
}));

import ProfileOpenGraphImage, {
  alt as profileAlt,
  runtime as profileRuntime,
  size as profileSize,
} from '@/app/[username]/opengraph-image';
import { GET as celebrationCardGET } from '@/app/api/celebration-card/[username]/route';
import InvestorOpenGraphImage, {
  runtime as investorRuntime,
} from '@/app/investor-portal/opengraph-image';
import { getProfileWithLinks } from '@/lib/services/profile';

const mockGetProfile = vi.mocked(getProfileWithLinks);

const PUBLIC_PROFILE = {
  isPublic: true,
  displayName: 'Test Artist',
  genres: ['pop', 'electronic'],
  avatarUrl: 'https://cdn.example.com/avatar.png',
} as unknown as Awaited<ReturnType<typeof getProfileWithLinks>>;

function stubImageFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        })
    )
  );
}

describe('profile opengraph-image', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('declares the nodejs runtime and static OG metadata', () => {
    expect(profileRuntime).toBe('nodejs');
    expect(profileAlt).toBe('Jovie artist profile');
    expect(profileSize).toEqual({ width: 1200, height: 630 });
  });

  it('renders the gradient fallback when the profile lookup fails', async () => {
    mockGetProfile.mockRejectedValue(new Error('db down'));
    const response = await ProfileOpenGraphImage({
      params: Promise.resolve({ username: 'TestArtist' }),
    });
    expect(response).toBeDefined();
    expect(mockGetProfile).toHaveBeenCalledWith('testartist');
  });

  it('renders the hero image for a public profile with an avatar', async () => {
    stubImageFetch();
    mockGetProfile.mockResolvedValue(PUBLIC_PROFILE);
    const response = await ProfileOpenGraphImage({
      params: Promise.resolve({ username: 'testartist' }),
    });
    expect(response).toBeDefined();
  });
});

describe('investor-portal opengraph-image', () => {
  it('declares the nodejs runtime and renders the card', () => {
    expect(investorRuntime).toBe('nodejs');
    expect(InvestorOpenGraphImage()).toBeDefined();
  });
});

describe('celebration-card route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('declares the nodejs runtime', async () => {
    const route = await import('@/app/api/celebration-card/[username]/route');
    expect(route.runtime).toBe('nodejs');
  });

  it('returns a downloadable card for a known username', async () => {
    mockGetProfile.mockResolvedValue(PUBLIC_PROFILE);
    const request = {
      nextUrl: new URL(
        'https://jov.ie/api/celebration-card/testartist?size=story&download=1'
      ),
    } as NextRequest;
    const response = await celebrationCardGET(request, {
      params: Promise.resolve({ username: 'TestArtist' }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Disposition')).toContain(
      'jovie-testartist-story.png'
    );
  });

  it('returns the fallback card when the profile lookup fails', async () => {
    mockGetProfile.mockRejectedValue(new Error('db down'));
    const request = {
      nextUrl: new URL('https://jov.ie/api/celebration-card/testartist'),
    } as NextRequest;
    const response = await celebrationCardGET(request, {
      params: Promise.resolve({ username: 'ghost' }),
    });
    expect(response).toBeDefined();
    expect(response.headers.get('Cache-Control')).toContain('max-age=86400');
  });
});
