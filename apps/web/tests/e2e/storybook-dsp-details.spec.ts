import { expect, type Locator, test } from '@playwright/test';

const CASES = [
  {
    id: 'mobile-root16',
    story: 'shell-dspavatarstack-mobiledrawer--layout',
    width: 390,
    height: 615,
    root: 16,
    activation: 'pointer',
    mobile: true,
    lastProvider: /^Qobuz$/,
  },
  {
    id: 'mobile-root32',
    story: 'shell-dspavatarstack-mobiledrawer--layout',
    width: 390,
    height: 615,
    root: 32,
    activation: 'Space',
    mobile: true,
    lastProvider: /^Qobuz$/,
  },
  {
    id: 'short-row-root32',
    story: 'dashboard-releases-shellreleaserow--dsp-scrollable-details',
    width: 1440,
    height: 360,
    root: 32,
    activation: 'Enter',
    mobile: false,
    lastProvider: /^Tidal$/i,
  },
] as const;

async function listGeometry(list: Locator) {
  return list.evaluate(element => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
    bounds: element.getBoundingClientRect().toJSON(),
    focused: element === element.ownerDocument.activeElement,
  }));
}

async function labelPaint(label: Locator) {
  return label.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const document = element.ownerDocument;
    return {
      bounds: bounds.toJSON(),
      inViewport:
        bounds.width > 0 &&
        bounds.height > 0 &&
        bounds.left >= 0 &&
        bounds.right <= document.documentElement.clientWidth &&
        bounds.top >= 0 &&
        bounds.bottom <= document.documentElement.clientHeight,
      hit: element.contains(
        document.elementFromPoint(
          bounds.left + bounds.width / 2,
          bounds.top + bounds.height / 2
        )
      ),
    };
  });
}

for (const scenario of CASES) {
  test(`DSP details remain keyboard reachable in ${scenario.id}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({
      width: scenario.width,
      height: scenario.height,
    });
    await page.goto(`/iframe.html?id=${scenario.story}&viewMode=story`, {
      waitUntil: 'domcontentloaded',
    });
    await page.addStyleTag({
      content: `html { font-size: ${scenario.root}px !important; }`,
    });
    await expect(page.locator('html')).toHaveCSS(
      'font-size',
      `${scenario.root}px`
    );
    if (!scenario.mobile) {
      // Position the real row near the lower viewport edge to exercise
      // collision handling. Do not override its clipping or panel styles.
      await page.addStyleTag({
        content:
          '#storybook-root { position: fixed; bottom: 8px; left: 0; right: 0; }',
      });
    }
    await page.evaluate(() => document.fonts.ready);

    const trigger = page.getByRole('button', {
      name: /^View DSP Distribution Details/i,
    });
    const owner = page.getByRole('dialog', { name: 'Release details' });
    if (scenario.mobile) {
      await expect(owner).toHaveAttribute('aria-modal', 'true');
      await expect(owner).toBeVisible();
    }

    if (scenario.activation === 'pointer') await trigger.click();
    else {
      await trigger.focus();
      await expect(trigger).toBeFocused();
      await trigger.press(scenario.activation);
    }
    const details = page.getByRole('dialog', {
      name: 'DSP Distribution Details',
    });
    const list = details.getByRole('region', { name: 'DSP Availability' });
    await expect(details).toBeVisible();
    await expect(list).toBeFocused();
    if (scenario.mobile) {
      await expect(
        owner.getByRole('dialog', { name: 'DSP Distribution Details' })
      ).toBeVisible();
      await expect
        .poll(() =>
          owner.evaluate(element =>
            element.contains(element.ownerDocument.activeElement)
          )
        )
        .toBe(true);
    }

    const initial = await listGeometry(list);
    expect(initial.clientHeight).toBeGreaterThan(0);
    expect(initial.scrollHeight).toBeGreaterThan(initial.clientHeight);
    await page.keyboard.press('PageDown');
    await expect
      .poll(async () => (await listGeometry(list)).scrollTop)
      .toBeGreaterThan(0);
    await page.keyboard.press('End');
    // Native scrolling can animate after key dispatch. Wait for the actual
    // end position; never assign scrollTop or scroll a label into view.
    await expect
      .poll(async () => {
        const state = await listGeometry(list);
        return Math.abs(
          state.scrollHeight - state.clientHeight - state.scrollTop
        );
      })
      .toBeLessThan(2);
    await expect(list).toBeFocused();
    const lastLabel = list.getByText(scenario.lastProvider);
    await expect
      .poll(async () => {
        const paint = await labelPaint(lastLabel);
        return paint.inViewport && paint.hit;
      })
      .toBe(true);
    const final = await listGeometry(list);
    const last = await labelPaint(lastLabel);
    const screenshot = info.outputPath('last-provider.png');
    await page.screenshot({ path: screenshot, fullPage: true });
    await info.attach('last-provider.png', {
      path: screenshot,
      contentType: 'image/png',
    });
    await info.attach('native-scroll.json', {
      body: JSON.stringify({ scenario: scenario.id, initial, final, last }),
      contentType: 'application/json',
    });

    await page.keyboard.press('Tab');
    await expect(list).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(details).toBeHidden();
    // Radix delivers close autofocus after unmount, not on a fixed frame.
    await expect(trigger).toBeFocused();
    if (scenario.mobile) {
      await expect(owner).toHaveAttribute('aria-modal', 'true');
      await expect(owner).toBeVisible();
      const background = page.getByTestId('dsp-background-action');
      await background.evaluate(element => element.focus());
      await expect(background).not.toBeFocused();
      await expect
        .poll(() =>
          owner.evaluate(element =>
            element.contains(element.ownerDocument.activeElement)
          )
        )
        .toBe(true);
    }
  });
}
