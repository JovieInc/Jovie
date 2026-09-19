import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
  test,
} from '@playwright/test';

const STORYBOOK_THEME_STORAGE_KEY = 'jovie-theme-storybook';
const EVIDENCE_DIR = join('test-results', 'storybook-ai-crawler-evidence');
const VIEWPORT = { width: 390, height: 844 } as const;

const STATES = [
  {
    id: 'features-dashboard-ai-crawler-aicrawlerdetailpanel--missing-telemetry',
    name: 'missing-telemetry',
  },
  {
    id: 'features-dashboard-ai-crawler-aicrawlerdetailpanel--loading',
    name: 'loading',
  },
  {
    id: 'features-dashboard-ai-crawler-aicrawlerdetailpanel--real-zero',
    name: 'real-zero',
  },
  {
    id: 'features-dashboard-ai-crawler-aicrawlerdetailpanel--populated',
    name: 'populated',
  },
  {
    id: 'features-dashboard-ai-crawler-aicrawlerdetailpanel--free-teaser',
    name: 'free-teaser',
  },
] as const;

async function openState(page: Page, storyId: string): Promise<Locator> {
  await page.setViewportSize(VIEWPORT);
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: STORYBOOK_THEME_STORAGE_KEY, value: 'light' }
  );
  await page.goto(`/iframe.html?id=${storyId}&viewMode=story`, {
    // The panel-visible assertion below owns cold Vite compilation readiness.
    waitUntil: 'commit',
    timeout: 60_000,
  });

  // The detail panel uses the mobile RightDrawer branch at this viewport. Its
  // fixed overlay is visible while the Storybook root itself has no in-flow
  // box, so root visibility is not a valid render readiness signal here.
  await expect(page.locator('#storybook-root')).toBeAttached({
    timeout: 60_000,
  });
  // Storybook dev compiles each story's module graph on demand and the repo's
  // own Storybook config documents cold-start compiles that can take minutes
  // (webServer timeout is 600s), so the first state must tolerate the full
  // cold compile rather than a short render window.
  const panel = page.getByTestId('ai-crawler-detail-panel');
  await expect(panel).toBeVisible({ timeout: 120_000 });
  return panel;
}

async function assertNarrowLayout(page: Page, panel: Locator) {
  const layout = await page.evaluate(() => {
    const root = document.getElementById('storybook-root');
    const scrolling = document.scrollingElement ?? document.documentElement;
    return {
      viewportWidth: window.innerWidth,
      rootScrollWidth: root?.scrollWidth ?? 0,
      documentScrollWidth: Math.max(
        scrolling.scrollWidth,
        document.body.scrollWidth,
        document.documentElement.scrollWidth
      ),
      documentClientWidth: document.documentElement.clientWidth,
    };
  });
  expect(
    layout.rootScrollWidth,
    `crawler story root overflows at narrow width: ${JSON.stringify(layout)}`
  ).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(
    layout.documentScrollWidth,
    `crawler story document overflows at narrow width: ${JSON.stringify(layout)}`
  ).toBeLessThanOrEqual(layout.documentClientWidth + 1);

  const monthly = await panel
    .getByText('Reads (30 Days)', { exact: true })
    .boundingBox();
  const weekly = await panel
    .getByText('This Week', { exact: true })
    .boundingBox();
  expect(
    monthly,
    'monthly metric should have measurable geometry'
  ).not.toBeNull();
  expect(
    weekly,
    'weekly metric should have measurable geometry'
  ).not.toBeNull();
  if (monthly && weekly) {
    expect(Math.abs(monthly.y - weekly.y)).toBeLessThanOrEqual(1);
    expect(weekly.x).toBeGreaterThanOrEqual(monthly.x + monthly.width);
  }

  const box = await panel.boundingBox();
  expect(
    box,
    'crawler detail panel should have measurable geometry'
  ).not.toBeNull();
  if (box) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(VIEWPORT.width + 1);
  }
}

async function assertState(
  panel: Locator,
  name: (typeof STATES)[number]['name']
) {
  await expect(panel).toContainText('AI Crawler Reads');
  await expect(panel).toHaveAttribute('aria-label', 'AI crawler analytics');

  if (name === 'missing-telemetry') {
    await expect(panel.getByText('Unknown', { exact: true })).toHaveCount(2);
    await expect(panel).toContainText(
      'AI crawler reads are Unknown until telemetry is available.'
    );
    await expect(panel).not.toContainText('No AI crawler visits recorded yet.');
    return;
  }

  if (name === 'loading') {
    // The loading branch renders 4 skeleton rows with 2 LoadingSkeleton slots
    // each (label + value), so the drawer shows 8 loading-skeleton slots.
    await expect(panel.locator('[data-slot="loading-skeleton"]')).toHaveCount(
      8
    );
    await expect(panel.getByRole('status').first()).toHaveAttribute(
      'aria-busy',
      'true'
    );
    // The fixture intentionally leaves the request pending. Read the current
    // loading snapshot once instead of waiting past fetchWithTimeout's
    // ten-second deadline, where the component correctly transitions to the
    // missing-telemetry state.
    const loadingText = await panel.textContent();
    expect(loadingText).not.toContain(
      'AI crawler reads are Unknown until telemetry is available.'
    );
    expect(loadingText).not.toContain('No AI crawler visits recorded yet.');
    return;
  }

  if (name === 'real-zero') {
    await expect(panel.getByText('0', { exact: true })).toHaveCount(2);
    await expect(panel).toContainText('No AI crawler visits recorded yet.');
    await expect(panel).not.toContainText(
      'AI crawler reads are Unknown until telemetry is available.'
    );
    return;
  }

  if (name === 'populated') {
    await expect(panel.getByText('420', { exact: true })).toBeVisible();
    await expect(panel.getByText('88', { exact: true })).toBeVisible();
    await expect(panel.getByText('GPTBot', { exact: true })).toBeVisible();
    await expect(panel.getByText('ClaudeBot', { exact: true })).toBeVisible();
    return;
  }

  await expect(panel).toContainText(
    'Upgrade to Pro to see named AI crawlers and 30-day trends.'
  );
  await expect(panel).toContainText('Upgrade to Pro');
  await expect(panel).toContainText('AI Crawler');
  await expect(panel).toContainText('They do not show an AI answer mention');
}

async function saveEvidence(
  page: Page,
  panel: Locator,
  state: (typeof STATES)[number],
  testInfo: TestInfo
) {
  const screenshot = await panel.screenshot({ animations: 'disabled' });
  const geometry = await panel.boundingBox();
  const evidence = JSON.stringify(
    {
      schemaVersion: 1,
      surface: 'ai-crawler-detail-panel',
      state: state.name,
      storyId: state.id,
      viewport: VIEWPORT,
      geometry,
      status: 'captured',
    },
    null,
    2
  );
  await mkdir(EVIDENCE_DIR, { recursive: true });
  await writeFile(join(EVIDENCE_DIR, `crawler-${state.name}.png`), screenshot);
  await writeFile(join(EVIDENCE_DIR, `crawler-${state.name}.json`), evidence);
  await testInfo.attach(`crawler-${state.name}`, {
    body: screenshot,
    contentType: 'image/png',
  });
  await testInfo.attach(`crawler-${state.name}-receipt`, {
    body: evidence,
    contentType: 'application/json',
  });
  await expect(panel).toBeVisible();
}

test.describe('AI crawler measurement state proof', () => {
  test.describe.configure({ retries: 0, timeout: 240_000 });

  for (const state of STATES) {
    test(`renders ${state.name} at narrow width`, async ({
      page,
    }, testInfo) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));

      const panel = await openState(page, state.id);
      await assertState(panel, state.name);
      await assertNarrowLayout(page, panel);
      await saveEvidence(page, panel, state, testInfo);
      expect(errors, `${state.name} Storybook page errors`).toEqual([]);
    });
  }
});
