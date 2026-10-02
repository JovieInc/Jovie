import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
  getProfileAndLinks: vi.fn(),
  isPublicProfileIndexable: vi.fn(),
}));

vi.mock('../_lib/public-profile-loader', () => ({
  getProfileAndLinks: mocks.getProfileAndLinks,
}));
vi.mock('@/constants/app', () => ({ BASE_URL: 'https://jov.ie' }));
vi.mock('@/lib/profile/public-profile-indexing-policy', () => ({
  isPublicProfileIndexable: mocks.isPublicProfileIndexable,
  PUBLIC_PROFILE_DISCOVERY_EXCLUSION_HEADERS: { 'X-Robots-Tag': 'noindex' },
}));
vi.mock('@/lib/profile/shop-settings', () => ({ isShopEnabled: () => false }));

function publicProfile(isClaimed = false) {
  return {
    username: 'musician',
    username_normalized: 'musician',
    display_name: 'A Musician',
    is_claimed: isClaimed,
    is_verified: false,
    spotify_url: 'https://open.spotify.com/artist/example',
  };
}

function requestGuide() {
  return GET(new Request('https://jov.ie/musician/llms.txt'), {
    params: Promise.resolve({ username: 'musician' }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isPublicProfileIndexable.mockReset().mockReturnValue(true);
  mocks.getProfileAndLinks.mockReset().mockResolvedValue({
    profile: publicProfile(),
    links: [],
    genres: [],
    latestRelease: null,
  });
});

describe('public profile agent guide work links', () => {
  it('includes previously omitted work and unlabeled destinations in the response', async () => {
    mocks.getProfileAndLinks.mockResolvedValue({
      profile: publicProfile(),
      links: [
        { platform: 'github', url: 'https://github.com/example' },
        { platform: '', url: 'https://example.com/work' },
        { platform: 'instagram', url: 'https://instagram.com/example' },
      ],
    });
    const response = await requestGuide();
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain('## Links\n\n- [github](<https://github.com/example>)');
    expect(body).toContain('- [example.com](<https://example.com/work>)');
    expect(body).toContain('## Social\n\n- **Instagram**: https://instagram.com/example');
    expect(response.headers.get('Content-Type')).toContain('text/plain');
  });

  it('does not duplicate existing music destinations or add an empty Links section', async () => {
    mocks.getProfileAndLinks.mockResolvedValue({
      profile: publicProfile(),
      links: [
        { platform: 'custom', url: 'https://open.spotify.com/artist/example' },
        { platform: 'website', url: 'javascript:alert(1)' },
        { platform: '', url: '' },
      ],
    });
    const body = await (await requestGuide()).text();
    expect(body.split('https://open.spotify.com/artist/example')).toHaveLength(2);
    expect(body).not.toContain('## Links');
    expect(body).not.toContain('javascript:');
  });

  it('treats inherited property names as unknown platforms rather than map entries', async () => {
    mocks.getProfileAndLinks.mockResolvedValue({
      profile: publicProfile(),
      links: [{ platform: 'constructor', url: 'https://example.com/work' }],
    });
    const body = await (await requestGuide()).text();
    expect(body).toContain('- [constructor](<https://example.com/work>)');
    expect(body).not.toContain('[native code]');
  });

  it.each([false, true])('preserves claim and verification status when claimed=%s', async isClaimed => {
    mocks.getProfileAndLinks.mockResolvedValue({
      profile: publicProfile(isClaimed),
      links: [{ platform: 'portfolio', url: 'https://example.com/work' }],
    });
    const body = await (await requestGuide()).text();
    expect(body).toContain(`**Claim status**: ${isClaimed ? 'Claimed' : 'Unclaimed'}`);
    expect(body).toContain('**Jovie verification**: Not verified');
    if (!isClaimed) expect(body).toContain('has not verified ownership, representation, or consent');
  });

  it('returns no work data when the loader excludes a private or missing profile', async () => {
    mocks.getProfileAndLinks.mockResolvedValue({
      profile: null,
      links: [{ platform: 'website', url: 'https://example.com/not-public' }],
    });
    const response = await requestGuide();
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Not found');
  });

  it('does not load an excluded handle', async () => {
    mocks.isPublicProfileIndexable.mockReturnValue(false);
    const response = await requestGuide();
    expect(response.status).toBe(404);
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex');
    expect(mocks.getProfileAndLinks).not.toHaveBeenCalled();
  });

  it('does not publish work for an excluded loaded identity', async () => {
    mocks.isPublicProfileIndexable.mockReturnValueOnce(true).mockReturnValueOnce(false);
    const response = await requestGuide();
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Not found');
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex');
  });
});
