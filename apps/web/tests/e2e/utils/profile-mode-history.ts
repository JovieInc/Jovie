import { writeFile } from 'node:fs/promises';
import { expect, type Page, type TestInfo } from '@playwright/test';

/** The JOV-6571 four-mode contract, exercised through the real profile controls. */
export async function certifyProfileModeHistory(
  page: Page,
  testInfo: TestInfo,
  handle: string
) {
  const source = 'jov-6572';
  const href = (mode: string) =>
    `/${handle}?${mode === 'profile' ? '' : `mode=${mode}&`}source=${source}`;
  const surface = page.getByTestId('profile-compact-surface');
  const nav = page.getByTestId('profile-bottom-nav');
  const ready = async () => {
    await expect(page.getByTestId('profile-compact-shell')).toHaveAttribute(
      'data-interactive-ready',
      'true'
    );
  };
  const observations: unknown[] = [];
  let stage = 'direct-events';
  const capture = async (name: string) => {
    const path = testInfo.outputPath(name);
    await page.screenshot({ path, animations: 'disabled', timeout: 10_000 });
    await testInfo.attach(name, { path, contentType: 'image/png' });
  };
  const observe = async (name: string) => {
    observations.push({
      stage: name,
      observedAt: new Date().toISOString(),
      ...(await page.evaluate(() => ({
        url: location.href,
        mode:
          document
            .querySelector('[data-testid="profile-compact-surface"]')
            ?.getAttribute('data-mode') ?? null,
        selected:
          document.querySelector(
            '[data-testid="profile-bottom-nav"] [aria-current="page"]'
          )?.textContent ?? null,
        historyLength: history.length,
      }))),
    });
    await writeFile(
      testInfo.outputPath('profile-mode-history.json'),
      JSON.stringify(
        {
          candidateId: process.env.CANONICAL_CANDIDATE_ID,
          runId: process.env.CANONICAL_RUN_ID,
          stage,
          viewport: page.viewportSize(),
          observations,
        },
        null,
        2
      )
    );
  };
  const aligned = async (mode: string, label: string) => {
    await expect(page).toHaveURL(
      url => `${url.pathname}${url.search}` === href(mode),
      { timeout: 15_000 }
    );
    await expect(surface).toHaveAttribute('data-mode', mode);
    await expect(
      nav.getByRole('button', { name: label, exact: true })
    ).toHaveAttribute('aria-current', 'page');
    await observe(stage);
  };
  try {
    expect(
      (
        await page.goto(href('tour'), { waitUntil: 'domcontentloaded' })
      )?.status()
    ).toBe(200);
    await ready();
    await aligned('tour', 'Events');
    const navBox = await nav.boundingBox();
    await capture('direct-events.png');
    stage = 'home';
    await nav.getByRole('button', { name: 'Home', exact: true }).click({
      noWaitAfter: true,
      timeout: 10_000,
    });
    await aligned('profile', 'Home');
    // A bounded stability observation is intentional: a transient match cannot
    // certify the recorded delayed URL/refresh regression.
    await page.waitForTimeout(15_000);
    stage = 'home-after-15s';
    await aligned('profile', 'Home');
    const homeNavBox = await nav.boundingBox();
    expect(navBox).not.toBeNull();
    expect(homeNavBox).not.toBeNull();
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect(Math.abs(homeNavBox![key] - navBox![key])).toBeLessThanOrEqual(1);
    }
    await capture('home-after-15s.png');
    stage = 'home-reloaded';
    expect(
      (await page.reload({ waitUntil: 'domcontentloaded' }))?.status()
    ).toBe(200);
    await ready();
    await aligned('profile', 'Home');
    const historyLength = await page.evaluate(() => history.length);
    stage = 'back-events';
    await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15_000 });
    await aligned('tour', 'Events');
    stage = 'forward-home';
    await page.goForward({ waitUntil: 'domcontentloaded', timeout: 15_000 });
    await aligned('profile', 'Home');
    expect(await page.evaluate(() => history.length)).toBe(historyLength);
    for (const [mode, label] of [
      ['listen', 'Music'],
      ['about', 'About'],
      ['tour', 'Events'],
      ['profile', 'Home'],
    ]) {
      stage = `nearby-${mode}`;
      const control = nav.getByRole('button', { name: label, exact: true });
      await control.focus();
      await control.press('Enter');
      await aligned(mode, label);
      await expect(control).toBeFocused();
    }
  } finally {
    if (!page.isClosed()) await observe('last-observed');
    const path = testInfo.outputPath('profile-mode-history.json');
    await writeFile(
      path,
      JSON.stringify(
        {
          candidateId: process.env.CANONICAL_CANDIDATE_ID,
          runId: process.env.CANONICAL_RUN_ID,
          stage,
          viewport: page.viewportSize(),
          observations,
        },
        null,
        2
      )
    );
    await testInfo.attach('profile-mode-history.json', {
      path,
      contentType: 'application/json',
    });
    if (!page.isClosed()) await capture('last-navigation-state.png');
  }
}
