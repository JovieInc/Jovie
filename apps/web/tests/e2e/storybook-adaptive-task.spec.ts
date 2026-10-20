import { expect, test } from '@playwright/test';

test.use({ hasTouch: true });

// Mounted source/component proof with API fixtures; not deployed persistence proof.
for (const variant of ['desktop', 'short-mobile', 'large-text'] as const) {
  test(`adaptive link acknowledgement preserves context on ${variant}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    await page.setViewportSize(
      variant === 'desktop'
        ? { width: 1280, height: 800 }
        : { width: 360, height: 420 }
    );
    await page.emulateMedia({
      colorScheme: variant === 'desktop' ? 'light' : 'dark',
      reducedMotion: 'reduce',
    });
    await page.addInitScript(() => {
      const calls: Array<{ requestId: string; reconcile?: boolean }> = [];
      Reflect.set(globalThis, '__adaptiveCalls', calls);
      Reflect.set(
        globalThis,
        '__jovieApiMock',
        ({ url, init }: { url: URL; init?: RequestInit }) => {
          if (url.pathname !== '/api/chat/confirm-link') return undefined;
          const body = JSON.parse(String(init?.body));
          calls.push(body);
          if (!body.reconcile)
            return Promise.reject(new TypeError('Response lost after commit'));
          return Response.json({
            success: true,
            platform: 'spotify',
            outcome: 'created',
            linkId: '00000000-0000-4000-8000-000000000002',
            version: 1,
            receipt: {
              scopeId: body.profileId,
              requestId: body.requestId,
              objectId: '00000000-0000-4000-8000-000000000002',
              revision: 1,
              durability: 'remote',
            },
          });
        }
      );
    });
    await page.goto(
      '/iframe.html?id=jovie-components-chatlinkconfirmationcard--confirmation&viewMode=story',
      { waitUntil: 'commit' }
    );
    const add = page.getByRole('button', { name: 'Add', exact: true });
    await expect(add).toBeVisible({ timeout: 180_000 });
    if (variant === 'large-text')
      await page.addStyleTag({
        content: 'html { font-size: 200% !important; }',
      });
    await page.evaluate(
      dark => document.documentElement.classList.toggle('dark', dark),
      variant !== 'desktop'
    );
    const editor = page.getByRole('textbox', { name: 'Unsent notes' });
    await editor.fill('Keep 日本語 draft');
    await editor.dispatchEvent('compositionstart');
    await editor.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
    await editor.dispatchEvent('compositionend');
    await expect(editor).toHaveValue('Keep 日本語 draft');
    // Focus may scroll a short viewport; document geometry must stay stable.
    const documentBox = () =>
      editor.evaluate(element => {
        const box = element.getBoundingClientRect();
        return {
          x: box.x + scrollX,
          y: box.y + scrollY,
          width: box.width,
          height: box.height,
        };
      });
    const before = await documentBox();
    await add.focus();
    if (variant === 'short-mobile') await add.tap();
    else await add.press('Enter');
    const check = page.getByRole('button', { name: 'Check save' });
    await expect(check).toBeVisible();
    await expect(check).toBeFocused();
    expect(await documentBox()).toEqual(before);
    await check.click();
    const saved = page.getByRole('button', { name: 'Added', exact: true });
    await expect(saved).toHaveAttribute('aria-disabled', 'true');
    await expect(
      page.getByRole('status', { name: 'Link Confirmation' })
    ).toHaveText('Spotify link added.');
    await expect(saved).toBeFocused();
    await expect(editor).toHaveValue('Keep 日本語 draft');
    expect(await documentBox()).toEqual(before);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
    const calls = await page.evaluate(() =>
      Reflect.get(globalThis, '__adaptiveCalls')
    );
    expect(calls).toHaveLength(2);
    expect(calls[0].requestId).toBe(calls[1].requestId);
    expect(calls[1].reconcile).toBe(true);
    for (const control of [
      saved,
      page.getByRole('button', { name: 'Dismiss Spotify link' }),
      editor,
    ]) {
      await control.evaluate(element =>
        element.scrollIntoView({
          block: 'center',
          inline: 'nearest',
          behavior: 'instant',
        })
      );
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(
        page.viewportSize()!.width
      );
      expect(box!.y + box!.height).toBeLessThanOrEqual(
        page.viewportSize()!.height
      );
    }
    await testInfo.attach(`adaptive-${variant}.png`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  });
}
