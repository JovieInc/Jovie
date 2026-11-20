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
    overflows: false,
    lastProvider: /^Qobuz$/,
    lastStatus: 'Live',
  },
  {
    id: 'mobile-root32',
    story: 'shell-dspavatarstack-mobiledrawer--layout',
    width: 390,
    height: 615,
    root: 32,
    activation: 'Space',
    mobile: true,
    overflows: true,
    lastProvider: /^Qobuz$/,
    lastStatus: 'Live',
  },
  {
    id: 'short-row-root32',
    story: 'dashboard-releases-shellreleaserow--dsp-scrollable-details',
    width: 1440,
    height: 360,
    root: 32,
    activation: 'Enter',
    mobile: false,
    overflows: true,
    lastProvider: /^Tidal$/i,
    lastStatus: 'Missing',
  },
] as const;

async function dialogGeometry(details: Locator) {
  return details.evaluate(element => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
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
    await expect(details).toBeFocused();
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

    const initial = await dialogGeometry(details);
    expect(initial.clientHeight).toBeGreaterThan(0);
    if (scenario.overflows) {
      expect(initial.scrollHeight).toBeGreaterThan(initial.clientHeight);
    } else {
      expect(initial.scrollHeight).toBeLessThanOrEqual(initial.clientHeight);
    }
    await page.keyboard.press('PageDown');
    if (scenario.overflows) {
      await expect
        .poll(async () => (await dialogGeometry(details)).scrollTop)
        .toBeGreaterThan(0);
    } else {
      expect((await dialogGeometry(details)).scrollTop).toBe(0);
    }
    await page.keyboard.press('End');
    await expect
      .poll(async () => {
        const state = await dialogGeometry(details);
        return Math.abs(
          state.scrollHeight - state.clientHeight - state.scrollTop
        );
      })
      .toBeLessThan(2);
    await expect(details).toBeFocused();
    const lastLabel = list.getByText(scenario.lastProvider);
    const lastStatus = lastLabel
      .locator('..')
      .getByText(scenario.lastStatus, { exact: true });
    for (const target of [details, lastLabel, lastStatus]) {
      await expect
        .poll(async () => {
          const paint = await labelPaint(target);
          return paint.inViewport && paint.hit;
        })
        .toBe(true);
    }
    const final = await dialogGeometry(details);
    expect(final.scrollWidth).toBeLessThanOrEqual(final.clientWidth);
    const last = await labelPaint(lastLabel);
    const status = await labelPaint(lastStatus);
    const screenshot = info.outputPath('last-provider.png');
    await page.screenshot({ path: screenshot, fullPage: true });
    await info.attach('last-provider.png', {
      path: screenshot,
      contentType: 'image/png',
    });
    await info.attach('native-scroll.json', {
      body: JSON.stringify({
        scenario: scenario.id,
        initial,
        final,
        last,
        status,
      }),
      contentType: 'application/json',
    });

    await page.keyboard.press('Tab');
    await expect(details).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(details).toBeHidden();
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
