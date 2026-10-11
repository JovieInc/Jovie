import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getInvestorPortalAccess: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  settingsSelect: vi.fn(),
}));

vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));
vi.mock('@/lib/investors/portal-access', () => ({
  getInvestorPortalAccess: mocks.getInvestorPortalAccess,
}));
vi.mock('@/lib/db', () => ({ db: { select: mocks.settingsSelect } }));
vi.mock('@/lib/db/schema/investors', () => ({ investorSettings: {} }));
vi.mock('@/lib/investors/manifest', () => ({
  getInvestorManifest: async () => ({
    pages: [
      { slug: 'memo', file: 'investor-memo.md', title: 'Memo', nav: true },
    ],
    deck: { slides: [], downloadFilename: 'Jovie-Pitch-Deck.pdf' },
  }),
}));
vi.mock('../_components/InvestorNav', () => ({ InvestorNav: () => null }));
vi.mock('../_components/InvestorStickyBar', () => ({
  InvestorStickyBar: () => null,
}));
vi.mock('@/components/features/pitch/InvestorBrief', () => ({
  InvestorBrief: () => null,
}));

import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';
import { generateMetadata as memoMetadata } from './[slug]/page';
import InvestorLayout from './layout';
import InvestorLandingPage, {
  generateMetadata as landingMetadata,
} from './page';

describe('investor portal gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.settingsSelect.mockReturnValue({
      from: () => ({ limit: async () => [] }),
    });
  });

  it('404s the layout and landing before reading portal data without access', async () => {
    mocks.getInvestorPortalAccess.mockResolvedValue(null);

    await expect(InvestorLayout({ children: null })).rejects.toThrow(
      'NEXT_NOT_FOUND'
    );
    await expect(InvestorLandingPage()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mocks.settingsSelect).not.toHaveBeenCalled();
  });

  it('never names the portal or a memo in metadata without access', async () => {
    mocks.getInvestorPortalAccess.mockResolvedValue(null);

    expect((await landingMetadata()).title).toBe('Not Found');
    expect(
      (await memoMetadata({ params: Promise.resolve({ slug: 'memo' }) })).title
    ).toBe('Not Found');
  });

  it.each([[{ kind: 'admin' }], [{ kind: 'investor', investorName: 'Ada' }]])(
    'renders the portal for %o',
    async access => {
      mocks.getInvestorPortalAccess.mockResolvedValue(access);

      await expect(InvestorLayout({ children: null })).resolves.toBeTruthy();
      await expect(InvestorLandingPage()).resolves.toBeTruthy();
      expect((await landingMetadata()).title).toBe('Jovie — Investors');
      const memo = await memoMetadata({
        params: Promise.resolve({ slug: 'memo' }),
      });
      expect(memo.title).toBe('Memo — Jovie Investors');
      expect(memo.robots).toEqual(NOINDEX_ROBOTS);
      expect(landingMetadata).toBeTypeOf('function');
      expect((await landingMetadata()).robots).toEqual(NOINDEX_ROBOTS);
    }
  );
});
