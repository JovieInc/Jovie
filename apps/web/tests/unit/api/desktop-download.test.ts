import { beforeEach, describe, expect, it, vi } from 'vitest';

const { release } = vi.hoisted(() => ({ release: vi.fn() }));
vi.mock('@/lib/desktop/github-releases', () => ({
  fetchLatestDesktopRelease: release,
  DESKTOP_RELEASES_HTML_URL: 'https://github.com/JovieInc/Jovie/releases',
}));

import { GET } from '@/app/api/desktop/download/route';

beforeEach(() => vi.clearAllMocks());
describe('desktop availability through the canonical download owner', () => {
  it.each([
    null,
    { mac: null },
    { mac: { url: 'https://example.test/Jovie-universal.dmg' } },
  ])(
    'reports usable universal availability and supported OS requirements',
    async value => {
      release.mockResolvedValue(value);
      const response = await GET(
        new Request('https://jov.ie/api/desktop/download?format=capabilities')
      );
      expect(await response.json()).toMatchObject({
        available: value ? Boolean(value.mac?.url) : null,
        minimumMacOSMajor: 13,
        architectures: ['arm64', 'x64'],
        artifact: 'universal',
      });
    }
  );
  it('preserves download redirects and unavailable-release fallback', async () => {
    release.mockResolvedValue({
      mac: { url: 'https://example.test/Jovie-universal.dmg' },
    });
    expect((await GET()).headers.get('location')).toBe(
      'https://example.test/Jovie-universal.dmg'
    );
    release.mockResolvedValue(null);
    expect((await GET()).headers.get('location')).toBe(
      'https://github.com/JovieInc/Jovie/releases'
    );
  });
});
