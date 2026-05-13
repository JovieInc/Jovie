/**
 * hydration-guard.spec.ts
 *
 * Two sections:
 * 1. Unit-style assertions on isHydrationMismatch / assertNoHydrationMismatches
 *    (no browser required — pure logic tests using Playwright's test runner)
 * 2. Lightweight browser smoke: navigate to '/' anonymously and verify no
 *    real hydration warnings fire (the setup.ts fixture enforces this automatically
 *    for all other tests too).
 */
import { expect, test } from '@playwright/test';
import {
  assertNoHydrationMismatches,
  isHydrationMismatch,
} from '../helpers/hydration-guard';

// ─── Unit: detector logic ────────────────────────────────────────────────────

test.describe('hydration-guard detector (unit)', () => {
  test('detects "Hydration failed because" pattern', () => {
    expect(
      isHydrationMismatch(
        'Hydration failed because the initial UI does not match what was rendered on the server.'
      )
    ).toBe(true);
  });

  test('detects "There was an error while hydrating" pattern', () => {
    expect(isHydrationMismatch('There was an error while hydrating.')).toBe(
      true
    );
  });

  test('detects "server did not match client" pattern', () => {
    expect(
      isHydrationMismatch(
        'Warning: Prop `className` did not match. Server: "foo" Client: "bar"'
      )
    ).toBe(true);
  });

  test('detects "Text content does not match" pattern', () => {
    expect(
      isHydrationMismatch('Text content does not match server-rendered HTML.')
    ).toBe(true);
  });

  test('detects "Expected server HTML to contain" pattern', () => {
    expect(
      isHydrationMismatch(
        'Expected server HTML to contain a matching <div> in <body>.'
      )
    ).toBe(true);
  });

  test('detects "Prop did not match" pattern', () => {
    expect(
      isHydrationMismatch('Warning: Prop `data-theme` did not match.')
    ).toBe(true);
  });

  test('does not flag unrelated clerk dev-keys message', () => {
    expect(
      isHydrationMismatch('Clerk: clerk has been loaded with development keys')
    ).toBe(false);
  });

  test('does not flag chunk load errors', () => {
    expect(
      isHydrationMismatch('ChunkLoadError: Loading chunk 123 failed.')
    ).toBe(false);
  });

  test('does not flag empty string', () => {
    expect(isHydrationMismatch('')).toBe(false);
  });

  test('does not flag generic network errors', () => {
    expect(isHydrationMismatch('Failed to fetch')).toBe(false);
  });

  test('assertNoHydrationMismatches passes when mismatches array is empty', () => {
    expect(() => assertNoHydrationMismatches([])).not.toThrow();
  });

  test('assertNoHydrationMismatches throws with readable message when mismatches present', () => {
    const mismatches = [
      'Hydration failed because the initial UI does not match.',
      'There was an error while hydrating.',
    ];
    expect(() => assertNoHydrationMismatches(mismatches)).toThrow(
      /hydration mismatch.*detected.*2 total/i
    );
  });
});

// ─── Browser smoke: confirm no real hydration warnings on homepage ────────────

test.describe('hydration-guard integration (browser)', () => {
  // Anonymous session — no auth cookies needed
  test.use({ storageState: { cookies: [], origins: [] } });

  test('homepage renders without real hydration warnings', async ({ page }) => {
    // Navigate to homepage — the setup.ts fixture automatically catches any
    // real console-error/warning hydration mismatches and fails the test.
    // If we reach the expect below, no hydration issues fired.
    const response = await page.goto('/', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    // Accept any 2xx or 3xx status (redirects to /signin are expected for anon users)
    expect(response?.status()).toBeGreaterThanOrEqual(200);
    expect(response?.status()).toBeLessThan(400);
  });
});
