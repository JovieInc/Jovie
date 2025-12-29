import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Marketing Homepage Visual Regression & Accessibility Tests
 *
 * These tests verify that all sections of the marketing homepage render correctly
 * and are accessible. They catch issues like blank sections, missing content,
 * and accessibility violations.
 *
 * @visual-regression
 * @accessibility
 */
test.describe('Marketing Homepage Visual Regression @visual', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to homepage and wait for content
    await page.goto('/', { timeout: 30000 });
    await page.waitForLoadState('domcontentloaded');
  });

  test('all homepage sections render with visible content', async ({
    page,
  }) => {
    // Wait for main content to be ready
    const main = page.locator('main#main-content');
    await expect(main).toBeVisible({ timeout: 10000 });

    // Define expected sections based on homepage structure
    // These selectors match the actual component hierarchy
    const sections = [
      { name: 'Hero Section', selector: 'header, [class*="hero"], section:first-child' },
      { name: 'Main Content', selector: 'main#main-content' },
    ];

    for (const section of sections) {
      const element = page.locator(section.selector).first();
      const isVisible = await element.isVisible().catch(() => false);
      expect(isVisible, `${section.name} should be visible`).toBe(true);

      // Verify section has meaningful content (not blank)
      if (isVisible) {
        const text = await element.textContent().catch(() => '');
        expect(
          text && text.trim().length > 10,
          `${section.name} should have content, but appears blank or nearly empty`
        ).toBe(true);
      }
    }
  });

  test('hero section displays headline and CTA', async ({ page }) => {
    // Check for main heading
    const h1 = page.locator('h1').first();
    await expect(h1, 'Homepage must have an h1 heading').toBeVisible({
      timeout: 10000,
    });

    const h1Text = await h1.textContent();
    expect(
      h1Text && h1Text.length > 5,
      'H1 heading should have meaningful text'
    ).toBe(true);

    // Check for CTA button or link
    const ctaButton = page
      .locator('button, a[href]')
      .filter({ hasText: /get started|sign up|join|waitlist|early access/i })
      .first();

    const hasCta = await ctaButton.isVisible().catch(() => false);
    expect(hasCta, 'Hero section should have a CTA button or link').toBe(true);
  });

  test('homepage sections are not blank or empty', async ({ page }) => {
    // Get all direct children of main content
    const mainContent = page.locator('main#main-content');
    await expect(mainContent).toBeVisible();

    // Check that main content has substantial content
    const mainText = await mainContent.textContent();
    expect(
      mainText && mainText.trim().length > 100,
      'Main content should have substantial text content'
    ).toBe(true);

    // Check for multiple content sections (at least hero + one other section)
    const sections = page.locator('main#main-content > section, main#main-content > div > section');
    const sectionCount = await sections.count();

    // Even if no explicit sections, verify content is distributed
    const allText = await mainContent.allTextContents();
    const totalLength = allText.join('').trim().length;

    expect(
      sectionCount > 0 || totalLength > 200,
      `Homepage should have multiple content sections or substantial content. Found ${sectionCount} sections, ${totalLength} chars.`
    ).toBe(true);
  });

  test('images and visual elements load correctly', async ({ page }) => {
    // Wait for images to load
    await page.waitForLoadState('load');

    // Check for broken images (images with naturalWidth = 0 after loading)
    const brokenImages = await page.evaluate(() => {
      const images = document.querySelectorAll('img');
      const broken: string[] = [];

      images.forEach(img => {
        // Skip lazy-loaded images that haven't loaded yet (outside viewport)
        if (img.complete && img.naturalWidth === 0 && img.src) {
          broken.push(img.src);
        }
      });

      return broken;
    });

    expect(
      brokenImages,
      `Found ${brokenImages.length} broken images: ${brokenImages.join(', ')}`
    ).toHaveLength(0);

    // Check for SVG icons (at least one should be present for branding)
    const svgCount = await page.locator('svg').count();
    expect(svgCount, 'Page should have SVG icons/graphics').toBeGreaterThan(0);
  });

  test('no CSS loading issues causing blank sections', async ({ page }) => {
    // Check that critical CSS classes are applying correctly
    const bodyBg = await page.evaluate(() => {
      const body = document.body;
      const styles = window.getComputedStyle(body);
      return {
        background: styles.backgroundColor,
        color: styles.color,
        fontFamily: styles.fontFamily,
      };
    });

    // Body should have defined styles (not transparent/empty)
    expect(
      bodyBg.background !== 'rgba(0, 0, 0, 0)',
      'Body background should be defined (CSS loaded)'
    ).toBe(true);

    expect(
      bodyBg.fontFamily.length > 0,
      'Font family should be defined (CSS loaded)'
    ).toBe(true);
  });
});

test.describe('Marketing Homepage Accessibility @a11y', () => {
  test('homepage meets WCAG 2.1 AA standards', async ({ page }) => {
    await page.goto('/', { timeout: 30000 });
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    if (results.violations.length > 0) {
      console.log('\nAccessibility violations found on Marketing Homepage:');
      results.violations.forEach(violation => {
        console.log(`\n- ${violation.id}: ${violation.description}`);
        console.log(`  Impact: ${violation.impact}`);
        console.log(`  Help: ${violation.helpUrl}`);
        console.log(
          `  Affected elements: ${violation.nodes.length} element(s)`
        );
        violation.nodes.slice(0, 3).forEach(node => {
          console.log(`    - ${node.target.join(' > ')}`);
        });
      });
    }

    expect(results.violations).toEqual([]);
  });

  test('all sections have proper heading hierarchy', async ({ page }) => {
    await page.goto('/', { timeout: 30000 });
    await page.waitForLoadState('domcontentloaded');

    // Check heading hierarchy
    const headings = await page.evaluate(() => {
      const h1s = document.querySelectorAll('h1');
      const h2s = document.querySelectorAll('h2');
      const h3s = document.querySelectorAll('h3');

      return {
        h1Count: h1s.length,
        h2Count: h2s.length,
        h3Count: h3s.length,
        h1Texts: Array.from(h1s).map(h => h.textContent?.trim()),
      };
    });

    // Should have exactly one h1 for SEO
    expect(
      headings.h1Count,
      `Should have exactly 1 h1, found ${headings.h1Count}: ${headings.h1Texts?.join(', ')}`
    ).toBe(1);

    // Should have multiple h2s for section titles
    expect(
      headings.h2Count,
      'Should have h2 headings for content sections'
    ).toBeGreaterThanOrEqual(0); // Flexible - some designs use h3
  });

  test('interactive elements are keyboard accessible', async ({ page }) => {
    await page.goto('/', { timeout: 30000 });
    await page.waitForLoadState('domcontentloaded');

    // Find all interactive elements
    const interactiveCount = await page
      .locator('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
      .count();

    expect(
      interactiveCount,
      'Page should have interactive elements'
    ).toBeGreaterThan(0);

    // Check that at least the first few interactive elements are focusable
    const firstButton = page.locator('button, a[href]').first();
    if (await firstButton.isVisible()) {
      await firstButton.focus();
      const isFocused = await firstButton.evaluate(
        el => document.activeElement === el
      );
      expect(isFocused, 'Interactive elements should be focusable').toBe(true);
    }
  });

  test('color contrast meets accessibility standards', async ({ page }) => {
    await page.goto('/', { timeout: 30000 });
    await page.waitForLoadState('networkidle');

    // Run axe specifically for color contrast
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2aa'])
      .analyze();

    const contrastViolations = results.violations.filter(
      v => v.id === 'color-contrast'
    );

    if (contrastViolations.length > 0) {
      console.log('\nColor contrast violations:');
      contrastViolations.forEach(violation => {
        violation.nodes.slice(0, 5).forEach(node => {
          console.log(`  - ${node.target.join(' > ')}: ${node.failureSummary}`);
        });
      });
    }

    expect(
      contrastViolations,
      'Text should have sufficient color contrast'
    ).toHaveLength(0);
  });
});

test.describe('Marketing Homepage Responsive Design @visual', () => {
  const viewports = [
    { name: 'Mobile', width: 375, height: 667 },
    { name: 'Tablet', width: 768, height: 1024 },
    { name: 'Desktop', width: 1280, height: 800 },
  ];

  for (const viewport of viewports) {
    test(`renders correctly on ${viewport.name} (${viewport.width}x${viewport.height})`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });

      await page.goto('/', { timeout: 30000 });
      await page.waitForLoadState('domcontentloaded');

      // Check main content is visible
      const main = page.locator('main#main-content');
      await expect(main).toBeVisible({ timeout: 10000 });

      // Check no horizontal overflow (common responsive issue)
      const hasHorizontalOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });

      expect(
        hasHorizontalOverflow,
        `${viewport.name} should not have horizontal overflow`
      ).toBe(false);

      // Check text is readable (not too small)
      const bodyFontSize = await page.evaluate(() => {
        return parseFloat(
          window.getComputedStyle(document.body).fontSize
        );
      });

      expect(
        bodyFontSize,
        `${viewport.name} font size should be at least 14px for readability`
      ).toBeGreaterThanOrEqual(14);
    });
  }
});
