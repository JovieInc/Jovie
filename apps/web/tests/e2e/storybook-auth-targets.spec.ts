import { expect, type Page, test } from '@playwright/test';

const controls =
  '[data-auth-provider-slot], [data-auth-shell-back], [aria-label="Go to homepage"], [data-auth-mode-switch] a, [data-auth-email-code-step] button';

async function geometry(page: Page) {
  return page.locator(controls).evaluateAll(elements =>
    elements.map(element => {
      const r = element.getBoundingClientRect();
      const pseudo = getComputedStyle(element, '::before');
      const size = (axis: 'width' | 'height', min: 'minWidth' | 'minHeight') =>
        pseudo.content === 'none'
          ? r[axis]
          : Math.max(
              r[axis],
              Number.parseFloat(pseudo[axis]),
              Number.parseFloat(pseudo[min]) || 0
            );
      const width = size('width', 'minWidth');
      const height = size('height', 'minHeight');
      return {
        name: element.getAttribute('aria-label') ?? element.textContent?.trim(),
        x: r.x + (r.width - width) / 2,
        y: r.y + (r.height - height) / 2,
        width,
        height,
        faceHeight: r.height,
      };
    })
  );
}

async function proveTargets(page: Page) {
  const boxes = await geometry(page);
  const viewport = page.viewportSize()!;
  for (const a of boxes) {
    expect(a.x).toBeGreaterThanOrEqual(0);
    expect(a.x + a.width).toBeLessThanOrEqual(viewport.width);
    expect(
      Math.min(a.width, a.height),
      `${a.name} target`
    ).toBeGreaterThanOrEqual(44);
    for (const b of boxes) {
      if (a === b) continue;
      const dx = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const dy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      expect(dx <= 0 || dy <= 0, `${a.name}/${b.name}`).toBe(true);
    }
  }
  // Observe native hit ownership without navigating or starting external OAuth.
  await page.evaluate(() =>
    document.addEventListener(
      'click',
      event => {
        const owner = (event.target as Element).closest('button,a');
        document.documentElement.dataset.authOwner =
          owner?.getAttribute('data-probe-owner') ?? 'whitespace';
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      { capture: true, once: false }
    )
  );
  const mouse = page.mouse.click.bind(page.mouse);
  const tap = page.touchscreen.tap.bind(page.touchscreen);
  const actions = await page.locator(controls).all();
  for (const [index, action] of actions.entries()) {
    await action.evaluate(
      (element, id) => element.setAttribute('data-probe-owner', String(id)),
      index
    );
    await action.scrollIntoViewIfNeeded();
    if (!(await action.isEnabled())) continue;
    await page.keyboard.press('Tab');
    await action.focus();
    expect(
      await action.evaluate(
        element =>
          element.matches(':focus-visible') &&
          getComputedStyle(element).boxShadow !== 'none'
      )
    ).toBe(true);
    const r = (await geometry(page))[index];
    for (const y of [r.y + 1, r.y + r.height - 1]) {
      for (const activate of [mouse, tap]) {
        await activate(r.x + r.width / 2, y);
        await expect(page.locator('html')).toHaveAttribute(
          'data-auth-owner',
          String(index)
        );
      }
    }
    expect(
      await action.evaluate(element => {
        const range = document.createRange();
        range.selectNodeContents(element.querySelector('span') ?? element);
        const label = range.getBoundingClientRect();
        const r = element.getBoundingClientRect();
        return (
          label.width <= r.width + 1 &&
          label.height <= r.height + 1 &&
          element.scrollWidth <= element.clientWidth + 1
        );
      }),
      'labels fit'
    ).toBe(true);
  }
  // Both adjacent provider and adjacent recovery actions leave inert whitespace.
  for (const selector of [
    '[data-auth-provider-slot]',
    '[data-auth-email-code-step="code"] button:not([type="submit"])',
  ]) {
    const pair = page.locator(selector);
    if ((await pair.count()) !== 2) continue;
    await pair.first().scrollIntoViewIfNeeded();
    const a = (await pair.nth(0).boundingBox())!;
    const b = (await pair.nth(1).boundingBox())!;
    const vertical = a.y + a.height <= b.y;
    for (const fraction of [0.25, 0.5, 0.75]) {
      const x = vertical
        ? a.x + a.width * fraction
        : a.x + a.width + (b.x - a.x - a.width) * fraction;
      const y = vertical
        ? a.y + a.height + (b.y - a.y - a.height) * fraction
        : a.y + a.height / 2;
      for (const activate of [mouse, tap]) {
        await activate(x, y);
        await expect(page.locator('html')).toHaveAttribute(
          'data-auth-owner',
          'whitespace'
        );
      }
    }
  }
}

for (const width of [320, 390, 768, 1440]) {
  test.describe(`${width}px auth targets`, () => {
    test.use({
      viewport: { width, height: 900 },
      isMobile: width < 768,
      hasTouch: true,
    });
    test('targets, ownership, focus and text scaling', async ({
      page,
    }, testInfo) => {
      for (const scale of [1, 2]) {
        for (const step of ['email', 'code']) {
          await page.goto(
            '/iframe.html?id=auth-authshell--claim-targets&viewMode=story'
          );
          await expect(
            page.locator('[data-auth-provider-slot]').first()
          ).toBeEnabled();
          await page.evaluate(async () => {
            const face = new FontFace(
              'Inter Variable',
              'url("/fonts/Inter-Latin.woff2")',
              { weight: '100 900' }
            );
            document.fonts.add(await face.load());
            await document.fonts.ready;
          });
          if (step === 'code') {
            // Presentation fixture through Storybook's existing API seam; no emails sent.
            await page.evaluate(() =>
              Object.assign(window, {
                __jovieApiMock: () => Response.json({ success: true }),
              })
            );
            await page.clock.install();
            await page
              .getByLabel('Email', { exact: true })
              .fill('e2e+targets@example.com');
            await page
              .getByRole('button', { name: 'Send sign-in code' })
              .click();
            await expect(
              page.locator('[data-auth-email-code-step]')
            ).toHaveAttribute('data-auth-email-code-step', 'code');
            const change = page.getByRole('button', { name: 'Change email' });
            const before = await change.boundingBox();
            await page.clock.runFor(31_000);
            await expect(
              page.getByRole('button', { name: 'Resend Verification Code' })
            ).toBeEnabled();
            expect(await change.boundingBox()).toEqual(before);
          }
          // Text-only scaling keeps layout spacing fixed, including pixel-based text tokens.
          await page.evaluate(scale => {
            const styles = [
              ...document.querySelectorAll<HTMLElement>('[data-auth-shell] *'),
            ].map(
              element =>
                [
                  element,
                  getComputedStyle(element).fontSize,
                  getComputedStyle(element).lineHeight,
                ] as const
            );
            for (const [element, size, lineHeight] of styles) {
              element.style.fontSize = `${Number.parseFloat(size) * scale}px`;
              element.style.lineHeight = `${Number.parseFloat(lineHeight) * scale}px`;
            }
          }, scale);
          await testInfo.attach(`${step}-${scale}x.json`, {
            body: JSON.stringify(await geometry(page)),
            contentType: 'application/json',
          });
          await proveTargets(page);
          if (step === 'email' && scale === 1) {
            const cta = page.getByRole('button', { name: 'Send sign-in code' });
            expect((await cta.boundingBox())?.height).toBe(28);
          }
          await testInfo.attach(`${step}-${scale}x.png`, {
            body: await page.screenshot({ fullPage: true }),
            contentType: 'image/png',
          });
        }
      }
    });
  });
}
