import type { TestRunnerConfig } from '@storybook/test-runner';
import { checkA11y, injectAxe } from 'axe-playwright';

/**
 * Storybook Test Runner Configuration
 *
 * Runs accessibility checks on all stories using axe-core.
 * Currently in WARN-ONLY mode - violations are logged but don't fail tests.
 *
 * To switch to blocking mode, change A11Y_FAIL_ON_VIOLATION to true.
 */

// Set to true to make a11y violations fail tests
const A11Y_FAIL_ON_VIOLATION = false;

export const config: TestRunnerConfig = {
  async preVisit(page) {
    // Inject axe-core into the page
    await injectAxe(page);
  },

  async postVisit(page, context) {
    // Run a11y checks after each story renders
    try {
      await checkA11y(page, '#storybook-root', {
        // WCAG 2.0 Level A and AA compliance
        axeOptions: {
          runOnly: {
            type: 'tag',
            values: ['wcag2a', 'wcag2aa'],
          },
        },
        // Detailed report for debugging
        detailedReport: true,
        detailedReportOptions: {
          html: true,
        },
      });
    } catch (error) {
      // Extract story info for better logging
      const storyId = context.id;

      if (A11Y_FAIL_ON_VIOLATION) {
        // Re-throw to fail the test
        throw error;
      }

      // Warn-only mode: log violations but don't fail
      console.warn(`\n⚠️  A11y violations in story: ${storyId}`);
      if (error instanceof Error) {
        // Parse axe violations from error message
        const lines = error.message.split('\n').slice(0, 20); // Limit output
        for (const line of lines) {
          if (line.trim()) {
            console.warn(`   ${line}`);
          }
        }
      }
      console.warn(''); // Empty line for readability
    }
  },
};

export default config;
