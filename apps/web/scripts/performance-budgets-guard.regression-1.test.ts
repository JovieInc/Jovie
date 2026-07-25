import type { Page } from '@playwright/test';
import { expect, it, vi } from 'vitest';
import { waitForExpectedUrl } from './performance-budgets-guard';

// Regression: JOV-4376 — warm-route readiness waited for the full load event
// Found by /qa on 2026-07-25
// Report: .gstack/qa-reports/qa-report-unified-app-shell-2026-07-25.md
it('accepts the destination after DOM content is ready', async () => {
  const destination = new URL('http://127.0.0.1:4100/app/library');
  const waitForURL = vi.fn(
    async (predicate: (url: URL) => boolean, options: unknown) => {
      expect(predicate(destination)).toBe(true);
      expect(options).toEqual({
        timeout: 15_000,
        waitUntil: 'domcontentloaded',
      });
    }
  );
  const page = { waitForURL } as unknown as Page;

  await waitForExpectedUrl(page, ['/app/library']);

  expect(waitForURL).toHaveBeenCalledOnce();
});
