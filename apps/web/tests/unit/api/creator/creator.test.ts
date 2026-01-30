import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetCreatorProfileWithLinks = vi.hoisted(() => vi.fn());

vi.mock('@/lib/services/profile', () => ({
  getProfileWithLinks: mockGetCreatorProfileWithLinks,
}));

describe('GET /api/creator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns 400 when username is missing', async () => {
    const { GET } = await import('@/app/api/creator/route');
    const request = new NextRequest('http://localhost/api/creator');
    const context = { params: Promise.resolve({}) };

    const response = await GET(request, context);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Username is required');
  });

  it('returns 404 when creator not found', async () => {
    mockGetCreatorProfileWithLinks.mockResolvedValue(null);

    const { GET } = await import('@/app/api/creator/route');
    const request = new NextRequest(
      'http://localhost/api/creator?username=nonexistent'
    );
    const context = { params: Promise.resolve({}) };

    const response = await GET(request, context);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Creator not found');
  });

  it('returns creator profile for valid username', async () => {
    mockGetCreatorProfileWithLinks.mockResolvedValue({
      id: 'profile_123',
      username: 'testcreator',
      usernameNormalized: 'testcreator',
      displayName: 'Test Creator',
      bio: 'A test creator',
      avatarUrl: null,
      creatorType: 'musician',
      spotifyUrl: null,
      appleMusicUrl: null,
      youtubeUrl: null,
      spotifyId: null,
      isPublic: true,
      isVerified: false,
      isClaimed: true,
      isFeatured: false,
      marketingOptOut: false,
      settings: {},
      theme: {},
      socialLinks: [],
    });

    const { GET } = await import('@/app/api/creator/route');
    const request = new NextRequest(
      'http://localhost/api/creator?username=testcreator'
    );
    const context = { params: Promise.resolve({}) };

    const response = await GET(request, context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.username).toBe('testcreator');
  });
});
