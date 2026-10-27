import { expect, test } from '@playwright/test';

for (const viewport of [
  { width: 1440, height: 900, fontSize: 16 },
  { width: 390, height: 615, fontSize: 16 },
  { width: 390, height: 615, fontSize: 24 },
  { width: 1440, height: 900, fontSize: 32 },
  { width: 390, height: 844, fontSize: 32 },
  { width: 390, height: 615, fontSize: 32 },
]) {
  test(`composer reserves its pending toolbar at ${viewport.width}x${viewport.height} with ${viewport.fontSize}px root text`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto(
      '/iframe.html?id=jovie-components-chatinput--drafting&viewMode=story',
      { waitUntil: 'domcontentloaded' }
    );
    const send = page.getByRole('button', {
      name: 'Send message',
      exact: true,
    });
    await expect(send).toBeEnabled();
    await page.evaluate(async fontSize => {
      document.documentElement.style.fontSize = `${fontSize}px`;
      await document.fonts.ready;
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );
    }, viewport.fontSize);
    await expect(page.locator('html')).toHaveCSS(
      'font-size',
      `${viewport.fontSize}px`
    );

    const geometry = await page
      .getByTestId('chat-composer-input-row')
      .evaluate(async row => {
        const toolbar = Array.from(row.children).find(child =>
          child.querySelector('button[aria-label="Send message"]')
        );
        if (!(toolbar instanceof HTMLElement)) {
          throw new Error('The real composer toolbar is required');
        }
        const frame = () =>
          new Promise<void>(resolve =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          );
        const box = () => {
          const rect = row.getBoundingClientRect();
          return { y: rect.y, height: rect.height };
        };
        // Preserve the actual component DOM and compiled app styles. Delay
        // only its last grid child, as when a streamed HTML chunk ends after
        // the textarea and the toolbar arrives in the next chunk.
        toolbar.remove();
        await frame();
        const pending = box();
        row.append(toolbar);
        await frame();
        return { pending, complete: box() };
      });

    await testInfo.attach('composer-toolbar-arrival.json', {
      body: JSON.stringify(geometry),
      contentType: 'application/json',
    });
    expect(geometry.complete.height).toBeCloseTo(geometry.pending.height, 1);
    expect(geometry.complete.y).toBeCloseTo(geometry.pending.y, 1);
    await expect(send).toBeEnabled();
    const surface = await page
      .getByTestId('chat-composer-surface')
      .boundingBox();
    const action = await send.boundingBox();
    expect(surface).not.toBeNull();
    expect(action).not.toBeNull();
    expect(action!.y).toBeGreaterThanOrEqual(surface!.y);
    expect(action!.y + action!.height).toBeLessThanOrEqual(
      surface!.y + surface!.height
    );
    const screenshot = testInfo.outputPath('composer-toolbar-arrival.png');
    await page.getByTestId('chat-composer-surface').screenshot({
      path: screenshot,
    });
    await testInfo.attach('composer-toolbar-arrival.png', {
      path: screenshot,
      contentType: 'image/png',
    });
  });
}
