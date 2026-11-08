import { expect, test } from './setup';
import { expectNoDocumentOverflow } from './utils/mobile-overflow';

/**
 * Claim search rows at phone width, light and dark: an unclaimed artist ends
 * in a visible Claim button, the signed-in owner's artist offers Open instead,
 * every row keeps a 44px tap target, and nothing scrolls sideways. Search is
 * stubbed so the check does not depend on Spotify or a signed-in session.
 */

const PHONE_WIDTHS = [375, 390] as const;
const COLOR_SCHEMES = ['light', 'dark'] as const;

const RESULTS = [
  {
    id: 'open-1',
    name: 'An Unclaimed Artist With A Very Long Stage Name',
    url: '',
    popularity: 0,
    followers: 48_000,
  },
  {
    id: 'mine-1',
    name: 'My Own Artist',
    url: '',
    popularity: 0,
    isClaimed: true,
    isClaimedByCurrentUser: true,
  },
];

test.describe('claim search rows at phone width', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const width of PHONE_WIDTHS) {
    for (const colorScheme of COLOR_SCHEMES) {
      test(`show Claim and Open at ${width}px in ${colorScheme}`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize({ width, height: 844 });
        await page.emulateMedia({ colorScheme });
        await page.route('**/api/spotify/search**', route =>
          route.fulfill({ json: RESULTS })
        );

        await page.goto('/claim', { waitUntil: 'domcontentloaded' });
        await page.getByTestId('claim-artist-search').fill('artist');

        const cta = page.getByTestId('claim-artist-option-cta');
        await expect(cta).toBeVisible();
        await expect(cta).toHaveText('Claim');

        const owned = page.getByTestId('claim-artist-owned');
        await expect(owned).toContainText('Open');
        await expect(owned).not.toContainText('Claim');

        for (const row of [page.getByTestId('claim-artist-option'), owned]) {
          const box = await row.boundingBox();
          expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
        }

        await expectNoDocumentOverflow(
          page,
          testInfo,
          `claim-rows-${width}-${colorScheme}`
        );
      });
    }
  }
});
