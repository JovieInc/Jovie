import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
  test,
} from '@playwright/test';

const STORY =
  '/iframe.html?id=guardrails-ovie-privacy-boundary--recovery&viewMode=story';
const LOCK_TRANSITION_KEY = 'ovie-privacy-lock-transition';
const LOCK_TRANSITION_ENDED_KEY = 'ovie-privacy-lock-transition-ended';
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'compact', width: 390, height: 844 },
] as const;
async function mode(page: Page, value: string) {
  await page.evaluate(
    value => sessionStorage.setItem('ovie-privacy-fixture-mode', value),
    value
  );
}
async function redacted(page: Page) {
  await expect(page.getByTestId('private-payload')).toHaveCount(0);
  await expect(page.getByTestId('private-chrome')).toHaveCount(0);
}
async function fit(page: Page, locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error('Missing rendered geometry');
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
  return box;
}
async function screenshot(page: Page, info: TestInfo, state: string) {
  const path = info.outputPath(`${state}.png`);
  await page.screenshot({ path, animations: 'disabled' });
  await info.attach(state, { path, contentType: 'image/png' });
}

for (const viewport of VIEWPORTS)
  for (const theme of ['light', 'dark'] as const) {
    test(`real Ovie recovery/redaction/reload and locked outcome ${viewport.name} ${theme}`, async ({
      page,
    }, info) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme });
      await page.addInitScript(
        theme => localStorage.setItem('jovie-theme-storybook', theme),
        theme
      );
      await page.goto(STORY, { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('private-payload')).toBeVisible({
        timeout: 60_000,
      });
      await expect(page.getByTestId('private-chrome')).toHaveCount(1);
      await expect(page.getByTestId('app-shell-sidebar-mount')).toHaveCount(1);
      await expect(page.getByRole('main')).toBeVisible();
      await expect(page.locator('html')).toHaveClass(
        new RegExp(String.raw`\b${theme}\b`)
      );
      const deadline = await page.evaluate(() =>
        sessionStorage.getItem('ovie-privacy-fixture-deadline')
      );
      await screenshot(page, info, 'before-unlocked');
      await mode(page, 'offline');
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      const reconnecting = page
        .getByRole('status')
        .filter({ hasText: 'Reconnecting to Ovie' });
      await expect(reconnecting).toBeVisible();
      await redacted(page);
      await expect(
        page.getByRole('button', { name: 'Unlock with passkey' })
      ).toHaveCount(0);
      const retry = page.getByRole('button', { name: 'Retry', exact: true });
      const retryBox = await fit(page, retry);
      const statusBox = await fit(page, reconnecting);
      for (
        let step = 0;
        step < 40 &&
        !(await retry.evaluate(element => element === document.activeElement));
        step++
      )
        await page.keyboard.press('Tab');
      await expect(retry).toBeFocused();
      expect(
        await retry.evaluate(element => element.matches(':focus-visible'))
      ).toBe(true);
      await page.keyboard.press('Enter');
      await expect(retry).toBeFocused();
      await expect(reconnecting).toBeVisible();
      expect(await fit(page, retry)).toEqual(retryBox);
      await screenshot(page, info, 'after-redacted-recovery');

      // Record the old document while it remains redacted. Renderer execution
      // is suspended during reload, so inspect the durable receipt afterwards.
      await page.evaluate(() => {
        const key = 'ovie-privacy-old-document';
        const sample = () => {
          const status = [
            ...document.querySelectorAll<HTMLElement>('[role="status"]'),
          ].find(element => element.textContent?.includes('Ovie'));
          const button = status?.querySelector('button');
          const box = (element?: Element | null) => {
            if (!element) return null;
            const { x, y, width, height } = element.getBoundingClientRect();
            return { x, y, width, height };
          };
          const previous = JSON.parse(sessionStorage.getItem(key) ?? '[]');
          sessionStorage.setItem(
            key,
            JSON.stringify([
              ...previous,
              {
                text: status?.textContent,
                status: box(status),
                button: box(button),
                privateCount: document.querySelectorAll(
                  '[data-testid="private-payload"], [data-testid="private-chrome"]'
                ).length,
              },
            ])
          );
        };
        sessionStorage.removeItem(key);
        sessionStorage.removeItem('ovie-privacy-old-document-ended');
        sample();
        const observer = new MutationObserver(sample);
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true,
        });
        window.addEventListener(
          'pagehide',
          () => {
            sample();
            sessionStorage.setItem(
              'ovie-privacy-old-document-ended',
              'pagehide'
            );
            observer.disconnect();
          },
          { once: true }
        );
      });
      const timeOrigin = await page.evaluate(() => performance.timeOrigin);
      await mode(page, 'unlocked');
      const navigation = page.waitForEvent(
        'framenavigated',
        frame => frame === page.mainFrame()
      );
      const trigger = page.evaluate(() =>
        window.dispatchEvent(new Event('online'))
      );
      await navigation;
      await trigger;
      const oldDocument = await page.evaluate(() =>
        JSON.parse(sessionStorage.getItem('ovie-privacy-old-document') ?? '[]')
      );
      expect(
        await page.evaluate(() =>
          sessionStorage.getItem('ovie-privacy-old-document-ended')
        )
      ).toBe('pagehide');
      expect(oldDocument.length).toBeGreaterThan(0);
      for (const sample of oldDocument) {
        expect(sample.privateCount).toBe(0);
        expect(sample.status).toEqual(statusBox);
        expect(sample.button).toEqual(retryBox);
      }
      await expect(page.getByTestId('private-payload')).toBeVisible();
      expect(await page.evaluate(() => performance.timeOrigin)).not.toBe(
        timeOrigin
      );
      expect(
        await page.evaluate(() =>
          sessionStorage.getItem('ovie-privacy-fixture-deadline')
        )
      ).toBe(deadline);
      await screenshot(page, info, 'fresh-document-restored');

      await mode(page, 'offline');
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(reconnecting).toBeVisible();
      await mode(page, 'locked');
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await expect(page.locator('[data-workspace-lock="true"]')).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Retry', exact: true })
      ).toHaveCount(0);
      await redacted(page);
      await fit(
        page,
        page.getByRole('button', { name: 'Unlock with passkey' })
      );
      await screenshot(page, info, 'confirmed-locked');
      expect(
        await page.evaluate(() =>
          JSON.parse(
            sessionStorage.getItem('ovie-privacy-fixture-calls') ?? '[]'
          )
        )
      ).toEqual(['GET', 'GET', 'GET', 'GET', 'GET']);
    });
  }

for (const scenario of ['enable-locked', 'enable-unlocked'] as const) {
  test(`real settings enable flow preserves the confirmed Ovie boundary (${scenario})`, async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS[0]);
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
    await page.addInitScript(
      ({ key, value }) => {
        if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, value);
      },
      { key: 'ovie-privacy-fixture-mode', value: scenario }
    );
    await page.goto(STORY, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('private-payload')).toBeVisible();
    await expect(page.getByTestId('private-chrome')).toHaveCount(1);
    await expect(
      page.getByRole('button', { name: 'Enable Ovie privacy lock' })
    ).toBeVisible();
    const originalDeadline = await page.evaluate(() =>
      sessionStorage.getItem('ovie-privacy-fixture-deadline')
    );
    const oldTimeOrigin = await page.evaluate(() => performance.timeOrigin);

    await page.evaluate(
      ({ transitionKey, endedKey }) => {
        sessionStorage.removeItem(transitionKey);
        sessionStorage.removeItem(endedKey);
        const sample = (phase: string) => {
          const previous = JSON.parse(
            sessionStorage.getItem(transitionKey) ?? '[]'
          ) as Array<{ phase: string; privateCount: number }>;
          sessionStorage.setItem(
            transitionKey,
            JSON.stringify([
              ...previous,
              {
                phase,
                privateCount: document.querySelectorAll(
                  '[data-testid="private-payload"], [data-testid="private-chrome"]'
                ).length,
              },
            ])
          );
        };
        sample('initial');
        window.addEventListener(
          'ovie:privacy-lock-confirmed',
          () => sample('confirmed'),
          { once: true }
        );
        const observer = new MutationObserver(() => sample('mutation'));
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true,
        });
        window.addEventListener(
          'pagehide',
          () => {
            sample('pagehide');
            sessionStorage.setItem(endedKey, 'pagehide');
            observer.disconnect();
          },
          { once: true }
        );
      },
      {
        transitionKey: LOCK_TRANSITION_KEY,
        endedKey: LOCK_TRANSITION_ENDED_KEY,
      }
    );

    const navigation = page.waitForEvent(
      'framenavigated',
      frame => frame === page.mainFrame()
    );
    await page
      .getByRole('button', { name: 'Enable Ovie privacy lock' })
      .click();
    await navigation;

    const oldDocument = await page.evaluate(
      key =>
        JSON.parse(sessionStorage.getItem(key) ?? '[]') as Array<{
          phase: string;
          privateCount: number;
        }>,
      LOCK_TRANSITION_KEY
    );
    expect(
      await page.evaluate(
        key => sessionStorage.getItem(key),
        LOCK_TRANSITION_ENDED_KEY
      )
    ).toBe('pagehide');
    expect(oldDocument[0]).toEqual({ phase: 'initial', privateCount: 2 });
    expect(oldDocument.some(sample => sample.phase === 'confirmed')).toBe(
      scenario === 'enable-locked'
    );
    if (scenario === 'enable-locked') {
      const confirmedIndex = oldDocument.findIndex(
        sample => sample.phase === 'confirmed'
      );
      const redactedIndex = oldDocument.findIndex(
        (sample, index) => index > confirmedIndex && sample.privateCount === 0
      );
      const pagehideIndex = oldDocument.findIndex(
        sample => sample.phase === 'pagehide'
      );
      expect(confirmedIndex).toBeGreaterThan(0);
      expect(redactedIndex).toBeGreaterThan(confirmedIndex);
      expect(redactedIndex).toBeLessThan(pagehideIndex);
      expect(
        oldDocument
          .slice(redactedIndex)
          .every(sample => sample.privateCount === 0)
      ).toBe(true);
      await expect(page.locator('[data-workspace-lock="true"]')).toBeVisible();
      await expect(page.getByTestId('private-payload')).toHaveCount(0);
      await expect(page.getByTestId('private-chrome')).toHaveCount(0);
    } else {
      expect(oldDocument.every(sample => sample.privateCount === 2)).toBe(true);
      await expect(page.getByTestId('private-payload')).toBeVisible();
      await expect(page.getByTestId('private-chrome')).toHaveCount(1);
      await expect(page.locator('[data-workspace-lock="true"]')).toHaveCount(0);
      expect(
        await page.evaluate(() =>
          sessionStorage.getItem('ovie-privacy-fixture-deadline')
        )
      ).toBe(originalDeadline);
    }
    expect(await page.evaluate(() => performance.timeOrigin)).not.toBe(
      oldTimeOrigin
    );
    expect(
      await page.evaluate(() =>
        JSON.parse(sessionStorage.getItem('ovie-privacy-fixture-calls') ?? '[]')
      )
    ).toEqual(['GET', 'POST']);
  });
}
