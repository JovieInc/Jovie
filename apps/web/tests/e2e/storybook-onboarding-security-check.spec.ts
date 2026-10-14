import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  test(`security recovery keeps the draft and composer stable at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(
      '/iframe.html?id=onboarding-security-check-recovery--state-sequence&viewMode=story'
    );
    const input = page.getByRole('textbox', { name: 'Chat Message Input' });
    const retry = page.getByRole('button', {
      name: 'Try Security Check Again',
    });
    const state = page.getByLabel('Verification state (fixture)');
    const send = page.getByRole('button', {
      name: 'Send message',
      exact: true,
    });
    await expect(input).toHaveValue('I am Test Artist');
    await expect(send).toBeDisabled();
    const inputBox = await input.boundingBox();
    const retryBox = await retry.boundingBox();
    expect(inputBox).not.toBeNull();
    expect(retryBox).not.toBeNull();

    for (const nextState of [
      'interactive',
      'error',
      'timeout',
      'unsupported',
      'unconfigured',
    ]) {
      await state.selectOption(nextState);
      await expect(page.getByRole('status')).toContainText(
        'Your draft is still here.'
      );
      await expect(input).toHaveValue('I am Test Artist');
      await expect(send).toBeDisabled();
      const nextInputBox = await input.boundingBox();
      const nextRetryBox = await retry.boundingBox();
      expect(nextInputBox?.y).toBeCloseTo(inputBox!.y, 0);
      expect(nextRetryBox?.y).toBeCloseTo(retryBox!.y, 0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        )
      ).toBe(true);
      await testInfo.attach(`security-check-${nextState}-${viewport.width}`, {
        body: await page.getByTestId('recovery-surface').screenshot(),
        contentType: 'image/png',
      });
      if (nextState === 'interactive' || nextState === 'error') {
        await expect(page.getByTestId('recovery-surface')).toHaveScreenshot(
          `security-check-${nextState}-${viewport.width}.png`
        );
      }
    }

    await retry.focus();
    await page.keyboard.press('Enter');
    await expect(state).toHaveValue('loading');
    await expect(retry).toBeFocused();
    await input.fill('My edited artist message');
    await state.selectOption('verified');
    await expect(retry).toHaveCount(0);
    await expect(input).toHaveValue('My edited artist message');
    await expect(send).toBeEnabled();
    await send.click();
    await expect(input).toBeEmpty();

    await state.selectOption('error');
    const results = await new AxeBuilder({ page })
      .include('[data-testid="recovery-surface"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}
