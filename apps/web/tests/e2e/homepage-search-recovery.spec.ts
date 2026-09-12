import type { Page, Route } from '@playwright/test';
import {
  assertExactNavigationUrl,
  primeVercelBypassCookie,
  requireExactNavigationOrigin,
} from '../helpers/vercel-preview';
import { expect, test } from './setup';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

type SpotifyArtistFixture = {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly imageUrl: string | null;
  readonly followers: number;
  readonly popularity: number;
};

type StartRequest = {
  readonly url: string;
  readonly nextRouterPrefetch: boolean;
};

const TAYLOR_SWIFT: SpotifyArtistFixture = {
  id: '06HL4z0CvFAxyc27GXpf02',
  name: 'Taylor Swift',
  url: 'https://open.spotify.com/artist/06HL4z0CvFAxyc27GXpf02',
  imageUrl: null,
  followers: 163_533_971,
  popularity: 98,
};

const STALE_ARTIST: SpotifyArtistFixture = {
  id: 'stale-artist-id',
  name: 'Stale Artist',
  url: 'https://open.spotify.com/artist/stale-artist-id',
  imageUrl: null,
  followers: 1,
  popularity: 1,
};

const SEARCH_ROUTE = '**/api/spotify/search**';
const START_PATH = '/start';

test.use({ storageState: { cookies: [], origins: [] } });

async function fulfillJson(
  route: Route,
  body: unknown,
  status = 200
): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function interceptWrites(page: Page): Promise<void> {
  for (const pattern of [
    '**/api/profile/view',
    '**/api/audience/visit',
    '**/api/track',
    '**/api/px',
  ]) {
    await page.route(pattern, route => fulfillJson(route, {}));
  }
}

async function gotoHomepage(page: Page): Promise<void> {
  await interceptWrites(page);
  await primeVercelBypassCookie(page, process.env.BASE_URL, '/');
  await page.goto('/', {
    waitUntil: 'domcontentloaded',
    timeout: SMOKE_TIMEOUTS.NAVIGATION,
  });
  await waitForHydration(page);
}

function heroSearch(page: Page) {
  return page
    .getByTestId('homepage-editorial-hero-search')
    .locator('.homepage-name-search');
}

function visibleArtistButton(page: Page, artistName: string) {
  return heroSearch(page)
    .locator('.homepage-name-search__results > div[aria-hidden="true"] button')
    .filter({ hasText: artistName })
    .first();
}

function collectStartRequests(page: Page): StartRequest[] {
  const requests: StartRequest[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    const headers = request.headers();
    if (url.pathname === START_PATH && headers.rsc === '1') {
      requests.push({
        url: request.url(),
        nextRouterPrefetch: headers['next-router-prefetch'] === '1',
      });
    }
  });
  return requests;
}

function collectStartNavigations(page: Page): string[] {
  const navigations: string[] = [];
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) {
      const url = new URL(frame.url());
      if (url.pathname === START_PATH) {
        navigations.push(frame.url());
      }
    }
  });
  return navigations;
}

async function expectDirectStartHandoff(
  page: Page,
  startRequests: readonly StartRequest[],
  startNavigations: readonly string[],
  artist: SpotifyArtistFixture
): Promise<void> {
  await page.waitForURL(url => url.pathname === START_PATH, {
    timeout: SMOKE_TIMEOUTS.NAVIGATION,
  });

  const expectedOrigin = requireExactNavigationOrigin(
    process.env.BASE_URL ?? 'http://localhost:3100'
  );
  const url = assertExactNavigationUrl(
    page.url(),
    expectedOrigin,
    'Homepage artist handoff'
  );

  expect(url.pathname).toBe(START_PATH);
  expect([...url.searchParams.keys()].sort()).toEqual([
    'artist_name',
    'spotify_url',
    'starter_prompt',
  ]);
  expect(url.searchParams.get('spotify_url')).toBe(artist.url);
  expect(url.searchParams.get('artist_name')).toBe(artist.name);
  expect(url.searchParams.get('starter_prompt')).toBe(
    `hey, I'm ${artist.name}. show me my Spotify.`
  );

  await expect
    .poll(
      () => startRequests.filter(request => !request.nextRouterPrefetch).length
    )
    .toBe(1);
  await expect.poll(() => startNavigations.length).toBe(1);
  await page.waitForTimeout(250);

  const directRequests = startRequests.filter(
    request => !request.nextRouterPrefetch
  );
  expect(directRequests).toHaveLength(1);
  const directRequest = directRequests[0];
  expect(directRequest).toBeDefined();
  if (!directRequest) {
    throw new Error('Expected one direct /start RSC request.');
  }
  // Next may prefetch /start separately; only an untagged request represents
  // the user-triggered handoff whose single-navigation contract we enforce.
  expect(
    startRequests
      .filter(request => request !== directRequest)
      .every(request => request.nextRouterPrefetch)
  ).toBe(true);

  const directRequestUrl = new URL(directRequest.url);
  directRequestUrl.searchParams.delete('_rsc');
  expect(directRequestUrl.href).toBe(url.href);
  expect(startNavigations).toEqual([url.href]);
}

test.describe('Homepage artist-search recovery (JOV-6034)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoHomepage(page);
  });

  test('announces terminal failure and retries the preserved query into results', async ({
    page,
  }) => {
    let attempts = 0;
    await page.route(SEARCH_ROUTE, async route => {
      attempts += 1;
      if (attempts <= 3) {
        await fulfillJson(route, { error: 'Request timed out' }, 408);
        return;
      }
      await fulfillJson(route, [TAYLOR_SWIFT]);
    });

    const search = heroSearch(page);
    const input = search.getByPlaceholder('Search your name');
    await input.fill('Taylor Swift');

    await expect(search.getByRole('alert')).toHaveText('Search failed.');
    await expect(
      search.getByRole('button', { name: 'Try again' })
    ).toBeVisible();
    await expect(input).toHaveValue('Taylor Swift');
    expect(attempts).toBe(3);

    await search.getByRole('button', { name: 'Try again' }).click();

    await expect(visibleArtistButton(page, TAYLOR_SWIFT.name)).toBeVisible();
    await expect(search.getByRole('alert')).toHaveCount(0);
    await expect(input).toHaveValue('Taylor Swift');
    expect(attempts).toBe(4);
  });

  test('renders an empty result without turning it into an error', async ({
    page,
  }) => {
    await page.route(SEARCH_ROUTE, route => fulfillJson(route, []));

    const search = heroSearch(page);
    const input = search.getByPlaceholder('Search your name');
    await input.fill('Nobody By This Name');

    await expect(search.getByText('No artists found')).toBeVisible();
    await expect(search.getByRole('alert')).toHaveCount(0);
    await expect(search.getByRole('button', { name: 'Try again' })).toHaveCount(
      0
    );
    await expect(input).toHaveValue('Nobody By This Name');
  });

  test('ignores a late stale result and hands off the artist from the latest query', async ({
    page,
  }) => {
    let releaseStaleResponse: (() => void) | undefined;
    let markStaleRequestSeen: (() => void) | undefined;
    const staleRequestSeen = new Promise<void>(resolve => {
      markStaleRequestSeen = resolve;
    });
    const staleResponseGate = new Promise<void>(resolve => {
      releaseStaleResponse = resolve;
    });

    await page.route(SEARCH_ROUTE, async route => {
      const query = new URL(route.request().url()).searchParams.get('q');
      if (query === 'Old Artist') {
        markStaleRequestSeen?.();
        await staleResponseGate;
        await fulfillJson(route, [STALE_ARTIST]).catch(() => {
          // The preferred outcome is that the superseded request was aborted.
        });
        return;
      }
      await fulfillJson(route, [TAYLOR_SWIFT]);
    });

    const startRequests = collectStartRequests(page);
    const startNavigations = collectStartNavigations(page);
    const input = heroSearch(page).getByPlaceholder('Search your name');
    await input.fill('Old Artist');
    await staleRequestSeen;
    await input.fill('Taylor Swift');

    const latestArtist = visibleArtistButton(page, TAYLOR_SWIFT.name);
    await expect(latestArtist).toBeVisible();
    releaseStaleResponse?.();

    await expect(visibleArtistButton(page, STALE_ARTIST.name)).toHaveCount(0);
    await latestArtist.click();
    await expectDirectStartHandoff(
      page,
      startRequests,
      startNavigations,
      TAYLOR_SWIFT
    );
  });

  test('supports one direct mobile keyboard handoff without duplicate navigation', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route(SEARCH_ROUTE, route => fulfillJson(route, [TAYLOR_SWIFT]));

    const startRequests = collectStartRequests(page);
    const startNavigations = collectStartNavigations(page);
    const input = heroSearch(page).getByPlaceholder('Search your name');
    await input.fill('Taylor Swift');
    await expect(visibleArtistButton(page, TAYLOR_SWIFT.name)).toBeVisible();

    await input.press('ArrowDown');
    await expect(input).toHaveAttribute(
      'aria-activedescendant',
      'homepage-name-search-results-result-0'
    );
    await input.press('Enter');

    await expectDirectStartHandoff(
      page,
      startRequests,
      startNavigations,
      TAYLOR_SWIFT
    );
  });
});
