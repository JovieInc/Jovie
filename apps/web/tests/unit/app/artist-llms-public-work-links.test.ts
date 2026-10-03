import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  indexable: vi.fn(() => true),
  reserved: vi.fn(() => false),
}));

vi.mock('@/constants/app', () => ({ BASE_URL: 'https://jov.ie' }));
vi.mock('@/app/[username]/_lib/public-profile-loader', () => ({
  getProfileAndLinks: mocks.load,
}));
vi.mock('@/lib/profile/public-profile-indexing-policy', () => ({
  isPublicProfileIndexable: mocks.indexable,
  PUBLIC_PROFILE_DISCOVERY_EXCLUSION_HEADERS: {
    'X-Robots-Tag': 'noindex, nofollow',
  },
}));
vi.mock('@/lib/profile/shop-settings', () => ({
  isShopEnabled: () => false,
}));
vi.mock('@/lib/validation/username-core', () => ({
  isReservedUsername: mocks.reserved,
  USERNAME_MIN_LENGTH: 3,
  USERNAME_MAX_LENGTH: 30,
  USERNAME_PATTERN: /^[a-z0-9_]+$/,
}));

import { GET } from '@/app/[username]/llms.txt/route';

function fixture() {
  return {
    profile: {
      username: 'exampleartist',
      username_normalized: 'exampleartist',
      display_name: 'Example Artist',
      is_claimed: false,
      is_verified: false,
      spotify_url: 'https://open.spotify.com/artist/example',
      settings: null,
    },
    links: [
      { platform: 'website', url: 'https://example.com/' },
      { platform: '', url: 'https://example.com/work' },
      { platform: 'constructor', url: 'https://example.com/code' },
      { platform: 'instagram', url: 'https://instagram.com/example' },
      { platform: 'custom', url: 'https://open.spotify.com/artist/example' },
      { platform: 'portfolio', url: 'javascript:alert(1)' },
    ],
    contacts: [{ email: 'private@example.com' }],
    genres: [],
    latestRelease: null,
  };
}

async function getGuide() {
  return GET(new Request('https://jov.ie/exampleartist/llms.txt'), {
    params: Promise.resolve({ username: 'exampleartist' }),
  });
}

describe('artist guide public work links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.indexable.mockReturnValue(true);
    mocks.reserved.mockReturnValue(false);
    mocks.load.mockResolvedValue(fixture());
  });

  it('retains public work without duplicating stream destinations or leaking contacts', async () => {
    const response = await getGuide();
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(text).toContain('## Links');
    expect(text).toContain('[website](<https://example.com/>)');
    expect(text).toContain('[example.com](<https://example.com/work>)');
    expect(text).toContain('[constructor](<https://example.com/code>)');
    expect(text).toContain('## Social');
    expect(text).toContain('https://instagram.com/example');
    expect(text.split('https://open.spotify.com/artist/example')).toHaveLength(
      2
    );
    expect(text).not.toContain('javascript:');
    expect(text).not.toContain('private@example.com');
    expect(text).toContain('Jovie has not verified ownership');
    expect(text).toContain('**Claim status**: Unclaimed');
  });

  it('preserves claimed status and omits an empty additional-links section', async () => {
    const data = fixture();
    data.profile.is_claimed = true;
    data.links = [];
    mocks.load.mockResolvedValue(data);
    const text = await (await getGuide()).text();
    expect(text).toContain('**Claim status**: Claimed');
    expect(text).not.toContain('## Links');
    expect(text).toContain('## Stream');
  });

  it('does not expose links when the loader withholds a private or missing profile', async () => {
    mocks.load.mockResolvedValue({ ...fixture(), profile: null });
    const response = await getGuide();
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Not found');
  });

  it('does not load a profile excluded from discovery', async () => {
    mocks.indexable.mockReturnValue(false);
    const response = await getGuide();
    expect(response.status).toBe(404);
    expect(mocks.load).not.toHaveBeenCalled();
    expect(response.headers.get('X-Robots-Tag')).toContain('noindex');
  });

  it('honors the display-name exclusion after loading', async () => {
    mocks.indexable.mockReturnValueOnce(true).mockReturnValueOnce(false);
    const response = await getGuide();
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Not found');
  });

  it('does not load reserved usernames', async () => {
    mocks.reserved.mockReturnValue(true);
    const response = await getGuide();
    expect(response.status).toBe(404);
    expect(mocks.load).not.toHaveBeenCalled();
  });
});
