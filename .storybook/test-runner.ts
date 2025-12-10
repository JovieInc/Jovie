import type { TestRunnerConfig } from '@storybook/test-runner';

export const config: TestRunnerConfig = {
  async preRender(page) {
    // Align axe with Storybook a11y panel: WCAG A/AA and color-contrast rule enabled
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__TEST_RUNNER_AXE_OPTIONS__ = {
        runOnly: ['wcag2a', 'wcag2aa'],
      };
    });
  },
};
