import { expect, test } from '@playwright/test';
import { APP_ROUTES } from '../../constants/routes';

for (const viewport of [
  { width: 1440, height: 900, fontSize: 16 },
  { width: 390, height: 615, fontSize: 16 },
  { width: 390, height: 615, fontSize: 24 },
  { width: 1440, height: 900, fontSize: 32 },
  { width: 390, height: 844, fontSize: 32 },
  { width: 390, height: 615, fontSize: 32 },
  { width: 768, height: 1024, fontSize: 12 },
  { width: 768, height: 1024, fontSize: 16, hero: true },
]) {
  test(`${viewport.hero ? 'hero' : 'default'} composer reserves its pending input and toolbar at ${viewport.width}x${viewport.height} with ${viewport.fontSize}px root text`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto(
      `/iframe.html?id=jovie-components-chatinput--${viewport.hero ? 'hero-drafting' : 'drafting'}&viewMode=story`,
      { waitUntil: 'domcontentloaded' }
    );
    const send = page.getByRole('button', {
      name: 'Send message',
      exact: true,
    });
    await expect(send).toBeEnabled();
    const input = page
      .getByTestId('chat-input-inline-field')
      .locator('textarea');
    // Keep the same one-line field as the initial entry, even at large text.
    // Multiline expansion remains a separate, user-requested transition.
    await input.fill('Hello');
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
        const field = row.querySelector(
          '[data-testid="chat-input-inline-field"]'
        );
        const textarea = field?.querySelector('textarea');
        if (
          !(toolbar instanceof HTMLElement) ||
          !(field instanceof HTMLElement) ||
          !textarea
        ) {
          throw new Error('The real composer field and toolbar are required');
        }
        const frame = () =>
          new Promise<void>(resolve =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          );
        const box = () => {
          const rect = row.getBoundingClientRect();
          return { y: rect.y, height: rect.height };
        };
        // Preserve the actual component nodes and compiled app styles. A
        // streamed chunk can stop at the grid's opening tag, or after its
        // input field. Neither later child may move the visible surface.
        field.remove();
        toolbar.remove();
        await frame();
        const pendingInput = box();
        row.append(field);
        await frame();
        const pendingToolbar = box();
        row.append(toolbar);
        await frame();
        return {
          pendingInput,
          pendingToolbar,
          complete: box(),
          retainedInput: row.querySelector('textarea') === textarea,
        };
      });

    await testInfo.attach('composer-toolbar-arrival.json', {
      body: JSON.stringify(geometry),
      contentType: 'application/json',
    });
    expect(geometry.retainedInput).toBe(true);
    for (const pending of [geometry.pendingInput, geometry.pendingToolbar]) {
      expect(geometry.complete.height).toBeCloseTo(pending.height, 1);
      expect(geometry.complete.y).toBeCloseTo(pending.y, 1);
    }
    await expect(send).toBeEnabled();
    await expect(input).toHaveValue('Hello');
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

for (const viewport of [
  { width: 768, height: 1024, fontSize: 16 },
  { width: 390, height: 615, fontSize: 32 },
]) {
  test(`sign-in keeps its target stable while its label arrives at ${viewport.width}x${viewport.height} with ${viewport.fontSize}px root text`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto(
      '/iframe.html?id=features-onboarding-onboardingshell--visitor&viewMode=story',
      { waitUntil: 'domcontentloaded' }
    );
    const signIn = page
      .getByTestId('onboarding-sign-in-header')
      .getByRole('link', { name: 'Sign in', exact: true });
    await expect(signIn).toBeVisible();
    // Prove this build resolves the current shared Link owner, including in
    // isolated worktrees whose dependency links can point at another checkout.
    await expect(signIn).toHaveAttribute('data-reserved-label', 'Sign in');
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
    const geometry = await signIn.evaluate(async link => {
      const nodes = Array.from(link.childNodes);
      const frame = () =>
        new Promise<void>(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        );
      const box = () => {
        const rect = link.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      };
      // The opening anchor and its attributes can paint before its label
      // arrives. Restore the same nodes; do not replace the real control.
      link.replaceChildren();
      await frame();
      const pending = box();
      link.append(...nodes);
      await frame();
      return { pending, complete: box() };
    });
    await testInfo.attach('sign-in-label-arrival.json', {
      body: JSON.stringify(geometry),
      contentType: 'application/json',
    });
    for (const dimension of ['x', 'y', 'width', 'height'] as const) {
      expect(geometry.complete[dimension]).toBeCloseTo(
        geometry.pending[dimension],
        1
      );
    }
    await expect(signIn).toHaveAttribute('href', APP_ROUTES.SIGNIN);
    await expect(signIn).toHaveText('Sign in');
    await signIn.focus();
    await expect(signIn).toBeFocused();
    const screenshot = testInfo.outputPath('sign-in-label-arrival.png');
    await page
      .getByTestId('onboarding-sign-in-header')
      .screenshot({ path: screenshot });
    await testInfo.attach('sign-in-label-arrival.png', {
      path: screenshot,
      contentType: 'image/png',
    });
  });
}
