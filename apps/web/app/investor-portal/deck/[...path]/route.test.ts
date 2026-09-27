import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getInvestorPortalAccess: vi.fn(),
}));

vi.mock('@/lib/investors/portal-access', () => ({
  getInvestorPortalAccess: mocks.getInvestorPortalAccess,
  INVESTOR_PRIVATE_HEADERS: {
    'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
    'Cache-Control': 'private, no-store',
  },
}));

import { GET } from './route';

function get(path: string) {
  return GET(new Request(`https://jov.ie/investor-portal/deck/${path}`), {
    params: Promise.resolve({ path: path.split('/') }),
  });
}

function expectPrivate(res: Response) {
  expect(res.headers.get('X-Robots-Tag')).toBe(
    'noindex, nofollow, noarchive, nosnippet'
  );
  expect(res.headers.get('Cache-Control')).toBe('private, no-store');
}

describe('GET /investor-portal/deck/[...path]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getInvestorPortalAccess.mockResolvedValue(null);
  });

  it.each(['Jovie-Pitch-Deck.pdf', 'index.html', 'assets/tim-universal.png'])(
    '404s %s without investor or admin access',
    async path => {
      const res = await get(path);

      expect(res.status).toBe(404);
      expectPrivate(res);
      expect(await res.text()).toBe('');
    }
  );

  it('streams the PDF deck as a private download for an investor', async () => {
    mocks.getInvestorPortalAccess.mockResolvedValue({
      kind: 'investor',
      investorName: null,
    });

    const res = await get('Jovie-Pitch-Deck.pdf');

    expect(res.status).toBe(200);
    expectPrivate(res);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="Jovie-Pitch-Deck.pdf"'
    );
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(bytes.byteLength).toBe(Number(res.headers.get('Content-Length')));
  });

  it('serves the HTML deck and its relative assets to an admin', async () => {
    mocks.getInvestorPortalAccess.mockResolvedValue({ kind: 'admin' });

    const html = await get('index.html');
    const asset = await get('assets/logo-icon-white.svg');

    expect(html.status).toBe(200);
    expect(html.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(await html.text()).toContain('deck-stage.js');
    expect(asset.status).toBe(200);
    expect(asset.headers.get('Content-Type')).toBe('image/svg+xml');
    expectPrivate(asset);
  });

  it.each([
    '../../../package.json',
    'assets/../../content/investors/manifest.json',
    'missing.pdf',
  ])(
    '404s paths outside the deck allowlist (%s) even for admins',
    async path => {
      mocks.getInvestorPortalAccess.mockResolvedValue({ kind: 'admin' });

      const res = await get(path);

      expect(res.status).toBe(404);
      expectPrivate(res);
    }
  );
});
