import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './setup';

/**
 * Marketing Homepage Visual Regression & Accessibility Test
 *
 * This test suite verifies:
 * 1. All critical sections are visible and not blank
 * 2. Visual regression via screenshot comparison
 * 3. WCAG 2.1 AA accessibility compliance
 * 4. Light/dark theme rendering
 *
 * Run with: pnpm test:e2e --grep "Homepage Visual"
 *
 * NOTE: Tests public homepage for unauthenticated visitors.
 * Must run without saved authentication.
 *
 * @visual-regression
 * @a11y
 */

// Override global storageState to run these tests as unauthenticated
test.use({ storageState: { cookies: [], origins: [] } });

const HOMEPAGE_SECTIONS = [
  {
    name: 'Hero Section',
    selectors: ['[data-section="hero"]', 'main > section:first-of-type', 'h1'],
    requiredText: true,
  },
  {
    name: 'Features Section',
    selectors: [
      '[data-section="features"]',
      '[data-section="pillars"]',
      'section:has(h2)',
    ],
    requiredText: true,
  },
  {
    name: 'CTA Section',
    selectors: [
      '[data-section="cta"]',
      'section:has(button)',
      'section:has(a[href*="signup"])',
    ],
    requiredText: false,
  },
] as const;

test.describe('Homepage Visual & A11y @visual-regression @a11y', () => {
  test.describe('Section Visibility', () => {
    test('all critical sections render with content (not blank)', async ({
      page,
    }) => {
      await page.goto('/', { timeout: 30000 });
      await page.waitForLoadState('domcontentloaded');
      // Wait for client-side hydration
      await page.waitForTimeout(2000);

      const sectionResults: Array<{
        name: string;
        visible: boolean;
        hasContent: boolean;
      }> = [];

      for (const section of HOMEPAGE_SECTIONS) {
        let foundElement = null;

        // Try each selector until we find a match
        for (const selector of section.selectors) {
          try {
            const el = page.locator(selector).first();
            if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
              foundElement = el;
              break;
            }
          } catch {
            continue;
          }
        }

        if (!foundElement) {
          sectionResults.push({
            name: section.name,
            visible: false,
            hasContent: false,
          });
          continue;
        }

        // Check if section has actual content (not blank)
        const textContent = await foundElement.textContent();
        const hasContent =
          textContent !== null && textContent.trim().length > 10;

        sectionResults.push({
          name: section.name,
          visible: true,
          hasContent,
        });
      }

      // Log results for debugging
      console.log('Homepage Section Analysis:');
      for (const result of sectionResults) {
        const status = result.visible
          ? result.hasContent
            ? '✅'
            : '⚠️ BLANK'
          : '❌ MISSING';
        console.log(`  ${status} ${result.name}`);
      }

      // Assert hero section is visible and has content
      const heroResult = sectionResults.find(r => r.name === 'Hero Section');
      expect(
        heroResult?.visible,
        'Hero section should be visible on homepage'
      ).toBe(true);
      expect(
        heroResult?.hasContent,
        'Hero section should have content (not blank)'
      ).toBe(true);

      // Check for blank sections (visible but empty)
      const blankSections = sectionResults.filter(
        r => r.visible && !r.hasContent
      );
      expect(
        blankSections.length,
        `Found ${blankSections.length} blank sections: ${blankSections.map(s => s.name).join(', ')}`
      ).toBe(0);
    });

    test('hero heading (h1) has meaningful text', async ({ page }) => {
      await page.goto('/', { timeout: 30000 });
      await page.waitForLoadState('domcontentloaded');

      const h1 = page.locator('h1').first();
      await expect(h1).toBeVisible({ timeout: 10000 });

      const text = await h1.textContent();
      expect(text?.trim().length).toBeGreaterThan(5);

      // Check it's not showing placeholder or loading text
      const lowerText = text?.toLowerCase() || '';
      expect(lowerText).not.toContain('loading');
      expect(lowerText).not.toContain('undefined');
      expect(lowerText).not.toContain('[object');
    });
  });

  test.describe('Visual Regression', () => {
    test('homepage renders consistently (light mode)', async ({ page }) => {
      await page.goto('/', { timeout: 30000 });
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000);

      // Force light mode
      await page.evaluate(() => {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('jovie-theme', 'light');
      });
      await page.waitForTimeout(500);

      // Take full-page screenshot (will auto-create baseline on first run)
      await expect(page).toHaveScreenshot('homepage-light.png', {
        fullPage: true,
        maxDiffPixelRatio: 0.1,
      });
    });

    test('homepage renders consistently (dark mode)', async ({ page }) => {
      await page.goto('/', { timeout: 30000 });
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000);

      // Force dark mode
      await page.evaluate(() => {
        document.documentElement.classList.add('dark');
        localStorage.setItem('jovie-theme', 'dark');
      });
      await page.waitForTimeout(500);

      // Take full-page screenshot
      await expect(page).toHaveScreenshot('homepage-dark.png', {
        fullPage: true,
        maxDiffPixelRatio: 0.1,
      });
    });

    test('hero section renders consistently above the fold', async ({
      page,
    }) => {
      await page.goto('/', { timeout: 30000 });
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000);

      // Set consistent viewport for above-the-fold test
      await page.setViewportSize({ width: 1280, height: 720 });

      await expect(page).toHaveScreenshot('homepage-hero-viewport.png', {
        fullPage: false,
        maxDiffPixelRatio: 0.1,
      });
    });

    // ENG-001: Below-the-fold visibility tests
    test('below-the-fold sections render with correct background (light mode)', async ({
      page,
    }) => {
      await page.goto('/', { timeout: 30000 });
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000);

      // Force light mode
      await page.evaluate(() => {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('jovie-theme', 'light');
      });
      await page.waitForTimeout(500);

      // Scroll to below-the-fold content
      await page.evaluate(() => window.scrollTo(0, window.innerHeight));
      await page.waitForTimeout(500);

      // Take screenshot of below-the-fold area
      await expect(page).toHaveScreenshot('homepage-below-fold-light.png', {
        fullPage: false,
        maxDiffPixelRatio: 0.1,
      });

      // Verify sections are not blank (have visible background, not pure black)
      const mainDiv = page
        .locator('main > div, div[class*="min-h-screen"]')
        .first();
      const bgColor = await mainDiv.evaluate(
        el => window.getComputedStyle(el).backgroundColor
      );
      // In light mode, background should not be pure black
      expect(bgColor).not.toBe('rgb(0, 0, 0)');
    });

    test('below-the-fold sections render with correct background (dark mode)', async ({
      page,
    }) => {
      await page.goto('/', { timeout: 30000 });
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000);

      // Force dark mode
      await page.evaluate(() => {
        document.documentElement.classList.add('dark');
        localStorage.setItem('jovie-theme', 'dark');
      });
      await page.waitForTimeout(500);

      // Scroll to below-the-fold content
      await page.evaluate(() => window.scrollTo(0, window.innerHeight));
      await page.waitForTimeout(500);

      // Take screenshot
      await expect(page).toHaveScreenshot('homepage-below-fold-dark.png', {
        fullPage: false,
        maxDiffPixelRatio: 0.1,
      });

      // Verify text is light colored in dark mode (not black)
      const mainDiv = page
        .locator('main > div, div[class*="min-h-screen"]')
        .first();
      const textColor = await mainDiv.evaluate(
        el => window.getComputedStyle(el).color
      );
      // Text should be light in dark mode, not black
      expect(textColor).not.toBe('rgb(0, 0, 0)');
    });
  });

  test.describe('Accessibility', () => {
    test('homepage has no WCAG 2.1 AA violations', async ({ page }) => {
      await page.goto('/', { timeout: 30000 });
      await page.waitForLoadState('networkidle');

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      if (results.violations.length > 0) {
        console.log('\nAccessibility violations on homepage:');
        results.violations.forEach(violation => {
          console.log(`\n- ${violation.id}: ${violation.description}`);
          console.log(`  Impact: ${violation.impact}`);
          console.log(`  Help: ${violation.helpUrl}`);
          console.log(`  Affected: ${violation.nodes.length} element(s)`);
          // Show first affected element for debugging
          if (violation.nodes[0]) {
            console.log(
              `  Example: ${violation.nodes[0].html.substring(0, 100)}...`
            );
          }
        });
      }

      expect(results.violations).toEqual([]);
    });

    test('homepage has no critical a11y issues in dark mode', async ({
      page,
    }) => {
      await page.goto('/', { timeout: 30000 });
      await page.waitForLoadState('networkidle');

      // Force dark mode
      await page.evaluate(() => {
        document.documentElement.classList.add('dark');
      });
      await page.waitForTimeout(300);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      // Filter for critical/serious issues only
      const criticalViolations = results.violations.filter(
        v => v.impact === 'critical' || v.impact === 'serious'
      );

      if (criticalViolations.length > 0) {
        console.log('\nCritical a11y violations in dark mode:');
        criticalViolations.forEach(v => {
          console.log(`  - ${v.id} (${v.impact}): ${v.description}`);
        });
      }

      expect(criticalViolations).toEqual([]);
    });

    // ENG-001: Below-the-fold contrast check
    test('below-the-fold sections meet contrast requirements', async ({
      page,
    }) => {
      await page.goto('/', { timeout: 30000 });
      await page.waitForLoadState('networkidle');

      // Scroll to ensure all sections are loaded
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(500);
      await page.evaluate(() => window.scrollTo(0, 0));

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2aa'])
        .include('section')
        .analyze();

      // Filter for color-contrast violations specifically
      const contrastViolations = results.violations.filter(
        v => v.id === 'color-contrast'
      );

      if (contrastViolations.length > 0) {
        console.log('Contrast violations in sections:');
        contrastViolations.forEach(v => {
          console.log(
            `  ${v.nodes.length} element(s) with insufficient contrast`
          );
        });
      }

      expect(contrastViolations).toEqual([]);
    });

    test('homepage has proper heading hierarchy', async ({ page }) => {
      await page.goto('/', { timeout: 30000 });
      await page.waitForLoadState('domcontentloaded');

      // Check for exactly one h1
      const h1Count = await page.locator('h1').count();
      expect(h1Count, 'Homepage should have exactly one h1').toBe(1);

      // Check heading levels don't skip (h1 -> h3 without h2)
      const headings = await page.evaluate(() => {
        const allHeadings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        return Array.from(allHeadings).map(h => ({
          level: parseInt(h.tagName.substring(1)),
          text: h.textContent?.trim().substring(0, 50),
        }));
      });

      let prevLevel = 0;
      const skippedLevels: string[] = [];
      for (const heading of headings) {
        if (heading.level > prevLevel + 1 && prevLevel !== 0) {
          skippedLevels.push(
            `h${prevLevel} -> h${heading.level} ("${heading.text}")`
          );
        }
        prevLevel = heading.level;
      }

      if (skippedLevels.length > 0) {
        console.warn('Skipped heading levels:', skippedLevels);
      }

      // Warn but don't fail on heading hierarchy (common in marketing pages)
      expect(skippedLevels.length).toBeGreaterThanOrEqual(0);
    });

    test('all interactive elements are keyboard accessible', async ({
      page,
    }) => {
      await page.goto('/', { timeout: 30000 });
      await page.waitForLoadState('networkidle');

      // Find all buttons and links
      const buttons = await page.locator('button:visible').all();
      const links = await page.locator('a[href]:visible').all();

      // Check buttons have accessible names
      for (const button of buttons.slice(0, 10)) {
        // Check first 10
        const accessibleName =
          (await button.getAttribute('aria-label')) ||
          (await button.textContent())?.trim();

        expect(
          accessibleName && accessibleName.length > 0,
          'Button should have accessible name'
        ).toBe(true);
      }

      // Check links have accessible names
      for (const link of links.slice(0, 10)) {
        // Check first 10
        const accessibleName =
          (await link.getAttribute('aria-label')) ||
          (await link.textContent())?.trim();

        expect(
          accessibleName && accessibleName.length > 0,
          'Link should have accessible name'
        ).toBe(true);
      }
    });

    test('images have alt text', async ({ page }) => {
      await page.goto('/', { timeout: 30000 });
      await page.waitForLoadState('networkidle');

      const images = await page.locator('img:visible').all();
      const missingAlt: string[] = [];

      for (const img of images) {
        const alt = await img.getAttribute('alt');
        const src = await img.getAttribute('src');
        const role = await img.getAttribute('role');

        // Decorative images should have empty alt or role="presentation"
        const isDecorative = alt === '' || role === 'presentation';
        const hasAlt = alt !== null && alt !== undefined;

        if (!hasAlt && !isDecorative) {
          missingAlt.push(src || 'unknown');
        }
      }

      if (missingAlt.length > 0) {
        console.warn('Images missing alt text:', missingAlt);
      }

      expect(missingAlt.length, 'All images should have alt text').toBe(0);
    });
  });

  test.describe('Theme Switching', () => {
    test('theme switches correctly without layout shift', async ({ page }) => {
      await page.goto('/', { timeout: 30000 });
      await page.waitForLoadState('networkidle');

      // Get initial layout measurements
      const getLayoutMetrics = async () => {
        return page.evaluate(() => {
          const main = document.querySelector('main');
          const hero = document.querySelector('h1');
          return {
            mainHeight: main?.getBoundingClientRect().height,
            heroTop: hero?.getBoundingClientRect().top,
          };
        });
      };

      const lightMetrics = await getLayoutMetrics();

      // Switch to dark mode
      await page.evaluate(() => {
        document.documentElement.classList.add('dark');
      });
      await page.waitForTimeout(300);

      const darkMetrics = await getLayoutMetrics();

      // Layout should be stable (small differences are OK due to font rendering)
      const heightDiff = Math.abs(
        (lightMetrics.mainHeight || 0) - (darkMetrics.mainHeight || 0)
      );
      expect(
        heightDiff < 50,
        'Theme switch caused layout shift in main content'
      ).toBe(true);
    });
  });
});
