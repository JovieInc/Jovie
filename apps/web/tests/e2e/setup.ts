/* eslint-disable react-hooks/rules-of-hooks */
import { test as base } from '@playwright/test';

declare global {
  interface Window {
    __REACT_DEVTOOLS_GLOBAL_HOOK__?: {
      supportsFiber: boolean;
      inject: () => void;
      onCommitFiberRoot: () => void;
      onCommitFiberUnmount: () => void;
    };
  }
}

// Extend the base test with custom setup
export const test = base.extend({
  // Override the page to handle React context issues and monitor console errors
  page: async ({ page }, usePage) => {
    // Array to collect console errors
    const consoleErrors: string[] = [];
    const consoleWarnings: string[] = [];

    // Listen for console errors and warnings
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const errorText = msg.text();
        // Skip expected test-related errors
        if (
          !errorText.includes('Failed to load resource') && // Common in tests
          !errorText.includes('ERR_INTERNET_DISCONNECTED') && // Network simulation
          !errorText.includes('Navigation cancelled') && // Test navigation
          !errorText.includes('AbortError') // Fetch cancellations in tests
        ) {
          consoleErrors.push(errorText);
        }
      }
      if (msg.type() === 'warning') {
        const warningText = msg.text();
        // Skip expected warnings
        if (
          !warningText.includes('React Hook') &&
          !warningText.includes('useContext') &&
          !warningText.includes('Invalid hook call')
        ) {
          consoleWarnings.push(warningText);
        }
      }
    });

    // Set up page to handle React context
    await page.addInitScript(() => {
      // Mock React context providers for testing
      window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
        supportsFiber: true,
        inject: () => {},
        onCommitFiberRoot: () => {},
        onCommitFiberUnmount: () => {},
      };
    });

    // Use the page
    await usePage(page);

    // After test completion, log console errors and warnings
    if (consoleErrors.length > 0) {
      console.warn('Console errors detected during E2E test:');
      consoleErrors.forEach(error => console.warn('  -', error));
    }

    if (consoleWarnings.length > 0) {
      console.warn('Console warnings detected during E2E test:');
      consoleWarnings.forEach(warning => console.warn('  -', warning));
    }
  },
});

export { expect } from '@playwright/test';
