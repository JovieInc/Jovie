import { expect, test } from '@playwright/test';

for (const viewport of [
  { width: 3440, height: 1440 },
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`metric states preserve geometry and keyboard focus at ${viewport.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(
      '/iframe.html?id=ui-atoms-cinematicmetric--stable-states&viewMode=story'
    );
    const control = page.getByRole('button', { name: 'Next metric state' });
    const metrics = page.locator('[data-slot="cinematic-metric"]');
    await expect(metrics).toHaveCount(3);
    await expect(metrics.first()).toHaveAttribute('aria-busy', 'true');
    const boxes = await metrics.evaluateAll(nodes =>
      nodes.map(node => {
        const rect = node.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      })
    );
    const following = await page
      .getByTestId('metric-following-content')
      .boundingBox();
    await control.focus();
    for (const value of ['Not measured', '0', '1,234,567']) {
      await page.keyboard.press('Enter');
      await expect(control).toBeFocused();
      await expect(metrics.first()).toHaveAttribute('aria-busy', 'false');
      await expect(
        metrics.first().getByText(value, { exact: true })
      ).toBeVisible();
      expect(
        await metrics.evaluateAll(nodes =>
          nodes.map(node => {
            const rect = node.getBoundingClientRect();
            return {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            };
          })
        )
      ).toEqual(boxes);
      expect(
        await page.getByTestId('metric-following-content').boundingBox()
      ).toEqual(following);
    }
    const beforeHover = await control.boundingBox();
    await control.hover();
    expect(await control.boundingBox()).toEqual(beforeHover);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
  });
}

for (const viewport of [
  { width: 3440, height: 1440 },
  { width: 1440, height: 900 },
]) {
  test(`Home overview keeps data and workspace geometry at ${viewport.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(
      '/iframe.html?id=features-admin-hud-oviehomehero--stable-states&viewMode=story',
      { waitUntil: 'domcontentloaded' }
    );
    const hero = page.getByTestId('ovie-home-hero');
    const metrics = hero.locator('[data-slot="cinematic-metric"]');
    const control = page.getByRole('button', { name: 'Next shipping state' });
    await expect(metrics).toHaveCount(11);
    const geometry = () =>
      page
        .locator(
          '[data-testid="ovie-home-hero"], [data-slot="cinematic-metric"], [data-testid="hero-following-content"]'
        )
        .evaluateAll(nodes =>
          nodes.map(node => {
            const r = node.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
          })
        );
    const before = await geometry();
    await control.focus();
    for (let step = 1; step <= 4; step++) {
      await page.keyboard.press('Enter');
      await expect(control).toBeFocused();
      await expect(hero.getByTestId('ovie-home-metrics')).toHaveAttribute(
        'aria-busy',
        'false'
      );
      if (step === 2)
        await expect(
          hero
            .getByTestId('home-loop-tile-merges-hour')
            .getByText('0', { exact: true })
        ).toBeVisible();
      if (step === 4)
        await expect(hero.getByTestId('home-loop-constraint')).toHaveText(
          'Shipping data could not load.'
        );
      expect(await geometry()).toEqual(before);
    }
    expect(
      await metrics
        .locator('dt')
        .evaluateAll(nodes =>
          nodes.every(node => parseFloat(getComputedStyle(node).fontSize) >= 12)
        )
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
  });
}
