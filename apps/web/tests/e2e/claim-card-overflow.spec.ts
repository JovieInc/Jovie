import { expect, test } from './setup';
import { expectNoDocumentOverflow } from './utils/mobile-overflow';

/**
 * The /claim card stays where it is while search results load, and the page
 * never scrolls sideways, at phone widths in light and dark. Search is
 * stubbed so the check does not depend on Spotify.
 */

const PHONE_WIDTHS = [375, 390] as const;
const COLOR_SCHEMES = ['light', 'dark'] as const;

const RESULTS = Array.from({ length: 6 }, (_, index) => ({
  id: `artist-${index}`,
  name: `Stub Artist With A Fairly Long Name ${index}`,
  url: '',
  popularity: 0,
  followers: 1200 * (index + 1),
}));

test.describe('claim card at phone width', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const width of PHONE_WIDTHS) {
    for (const colorScheme of COLOR_SCHEMES) {
      test(`stays put and fits at ${width}px in ${colorScheme}`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize({ width, height: 844 });
        await page.emulateMedia({ colorScheme });
        await page.route('**/api/spotify/search**', route =>
          route.fulfill({ json: RESULTS })
        );

        await page.goto('/claim', { waitUntil: 'domcontentloaded' });
        const heading = page.getByRole('heading', {
          level: 1,
          name: 'Claim Your Artist Profile',
        });
        await expect(heading).toBeVisible();
        const before = await heading.boundingBox();

        await page.getByTestId('claim-artist-search').fill('stub');
        await expect(page.getByTestId('claim-artist-results')).toBeVisible();
        const after = await heading.boundingBox();

        expect(before).not.toBeNull();
        expect(after?.y).toBe(before?.y);
        await expectNoDocumentOverflow(
          page,
          testInfo,
          `claim-${width}-${colorScheme}`
        );
      });
    }
  }

  test('keeps the create-profile button reachable on a short phone', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 600 });
    await page.route('**/api/spotify/search**', route =>
      route.fulfill({ json: RESULTS })
    );

    await page.goto('/claim', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('claim-artist-search').fill('stub');
    await expect(page.getByTestId('claim-artist-results')).toBeVisible();

    // html and body never scroll here, so the page itself has to.
    const create = page.getByTestId('claim-create-profile');
    await create.scrollIntoViewIfNeeded();
    await expect(create).toBeInViewport();
  });
});
