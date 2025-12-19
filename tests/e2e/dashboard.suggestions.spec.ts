import { setupClerkTestingToken } from '@clerk/testing/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './setup';

type ApiLink = {
  platform: string;
  platformType?: string | null;
  url: string;
  sortOrder?: number | null;
  isActive?: boolean | null;
  displayText?: string | null;
  state?: 'active' | 'suggested' | 'rejected' | null;
  confidence?: number | null;
  sourcePlatform?: string | null;
  sourceType?: 'manual' | 'admin' | 'ingested' | null;
  evidence?: { sources?: string[]; signals?: string[] } | null;
};

const hasSuggestionsEnv =
  Boolean(process.env.E2E_CLERK_USER_USERNAME) &&
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) &&
  Boolean(process.env.CLERK_SECRET_KEY) &&
  Boolean(process.env.DATABASE_URL);

test.describe('Dashboard suggested links', () => {
  test.skip(
    !hasSuggestionsEnv,
    'Skipping suggestion smoke test - Clerk or database env missing'
  );

  test('moves suggested pill into active list when accepted', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await setupClerkTestingToken({ page });

    await page.goto('/app/dashboard/profile', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    if (page.url().includes('/onboarding')) {
      test.skip(
        true,
        'Profile onboarding required before running suggestion smoke'
      );
    }

    const profileId = await page
      .getByTestId('profile-id')
      .getAttribute('data-profile-id');

    if (!profileId) {
      test.skip(true, 'No profile id available for suggestions smoke test');
    }

    const existingLinks = await fetchExistingLinks(page, profileId!);

    const suggestionUrl = `https://instagram.com/${Date.now().toString(36)}-suggest`;
    await seedSuggestedLink(page, profileId!, existingLinks, suggestionUrl);

    await page.reload({ waitUntil: 'domcontentloaded' });

    const activeInstagramBefore = page
      .locator('[data-testid^="link-pill-"]')
      .filter({ hasText: 'Instagram' })
      .filter({ hasNotText: 'Suggested' });
    const initialActiveCount = await activeInstagramBefore.count();

    const suggestionPill = page
      .locator('[data-testid^="link-pill-suggestion::"]')
      .filter({ hasText: 'Instagram' })
      .first();
    await expect(suggestionPill).toBeVisible();

    await suggestionPill
      .getByRole('button', { name: /Open actions for Instagram/i })
      .click();

    const menu = page.getByRole('menu').last();
    await expect(menu).toBeVisible();
    await menu.getByRole('menuitem', { name: /^Add$/ }).click();

    await expect(suggestionPill).toBeHidden();

    const activeInstagram = page
      .locator('[data-testid^="link-pill-"]')
      .filter({ hasText: 'Instagram' })
      .filter({ hasNotText: 'Suggested' })
      .first();
    await expect(activeInstagram).toBeVisible();
    await expect(activeInstagramBefore).toHaveCount(initialActiveCount + 1);
  });
});

async function fetchExistingLinks(page: Page, profileId: string) {
  const response = await page.request.get(
    `/api/dashboard/social-links?profileId=${profileId}`
  );
  if (!response.ok()) {
    throw new Error(`Failed to load existing links for profile ${profileId}`);
  }

  const json = (await response.json()) as { links: ApiLink[] };
  return json.links ?? [];
}

async function seedSuggestedLink(
  page: Page,
  profileId: string,
  existing: ApiLink[],
  suggestionUrl: string
) {
  const normalized = existing.map((link, index) => ({
    platform: link.platform,
    platformType: link.platformType ?? 'social',
    url: link.url,
    sortOrder: index,
    isActive: (link.state ?? 'active') === 'active',
    displayText: link.displayText ?? undefined,
    state:
      (link.state as 'active' | 'suggested' | 'rejected' | undefined) ??
      (link.isActive ? 'active' : 'suggested'),
    confidence:
      typeof link.confidence === 'number' ? link.confidence : undefined,
    sourcePlatform: link.sourcePlatform ?? undefined,
    sourceType: (link.sourceType ?? 'manual') as
      | 'manual'
      | 'admin'
      | 'ingested',
    evidence: link.evidence ?? undefined,
  }));

  normalized.push({
    platform: 'instagram',
    platformType: 'social',
    url: suggestionUrl,
    sortOrder: normalized.length,
    isActive: false,
    displayText: 'Instagram suggestion',
    state: 'suggested',
    confidence: 0.92,
    sourcePlatform: 'ingestion-test',
    sourceType: 'ingested',
    evidence: { sources: ['e2e'], signals: ['seeded'] },
  });

  const putResponse = await page.request.put('/api/dashboard/social-links', {
    data: { profileId, links: normalized },
  });

  if (!putResponse.ok()) {
    throw new Error(
      `Failed to seed suggestion for profile ${profileId}: ${await putResponse
        .text()
        .catch(() => '')}`
    );
  }
}
