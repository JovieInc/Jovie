import AxeBuilder from '@axe-core/playwright';
import { test } from '@playwright/test';
import { waitForLoad } from './utils/smoke-test-utils';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Full A11y Scan', () => {
  test.setTimeout(180_000);

  const routes = [
    '/',
    '/signin',
    '/signup',
    '/pricing',
    '/support',
    '/link-in-bio',
    '/blog',
  ];

  for (const route of routes) {
    test(`${route} full scan`, async ({ page }) => {
      await page.goto(route, { timeout: 120_000 });
      await waitForLoad(page);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
        .analyze();

      if (results.violations.length > 0) {
        console.log(
          `\n=== ${route} (${results.violations.length} violations) ===`
        );
        for (const v of results.violations) {
          console.log(`  [${v.impact}] ${v.id}: ${v.description}`);
          console.log(
            `    Tags: ${v.tags.filter(t => t.startsWith('wcag')).join(', ')}`
          );
          console.log(`    Nodes: ${v.nodes.length}`);
          for (const n of v.nodes.slice(0, 3)) {
            console.log(`    -> ${n.html.substring(0, 150)}`);
            if (n.failureSummary) {
              console.log(`       ${n.failureSummary.split('\n')[0]}`);
            }
          }
        }
      } else {
        console.log(`${route}: CLEAN (0 violations)`);
      }
    });
  }
});
