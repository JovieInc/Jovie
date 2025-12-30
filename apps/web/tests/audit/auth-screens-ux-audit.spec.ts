/**
 * Comprehensive UX Audit for Auth Screens
 *
 * This script audits all authentication screens for:
 * - Layout/positioning issues (overlapping, clipping, overflow)
 * - Accessibility violations (ARIA, color contrast, focus)
 * - Responsive breakpoint failures
 *
 * Run with: pnpm exec playwright test tests/audit/auth-screens-ux-audit.spec.ts --headed
 */

import AxeBuilder from '@axe-core/playwright';
import { type Page, test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// Viewport configurations
const VIEWPORTS = [
  { width: 375, height: 667, name: 'mobile-small', device: 'iPhone SE' },
  { width: 390, height: 844, name: 'mobile-medium', device: 'iPhone 12/13' },
  {
    width: 414,
    height: 896,
    name: 'mobile-large',
    device: 'iPhone 11 Pro Max',
  },
  { width: 768, height: 1024, name: 'tablet', device: 'iPad' },
  { width: 834, height: 1194, name: 'tablet-large', device: 'iPad Pro 11"' },
  { width: 1024, height: 768, name: 'desktop-small', device: 'Desktop Small' },
  {
    width: 1440,
    height: 900,
    name: 'desktop-medium',
    device: 'Desktop Medium',
  },
  { width: 1920, height: 1080, name: 'desktop-large', device: 'Desktop Large' },
];

interface AuditIssue {
  screen: string;
  state: string;
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  breakpoint: string;
  title: string;
  description: string;
  screenshot?: string;
  recommendation?: string;
  wcagViolation?: string;
  codeLocation?: string;
}

const issues: AuditIssue[] = [];

// Helper to add issue
function addIssue(issue: AuditIssue) {
  issues.push(issue);
  console.log(`[${issue.severity}] ${issue.screen} - ${issue.title}`);
}

// Helper to check element overlap
async function _checkElementOverlap(
  page: Page,
  selector1: string,
  selector2: string
): Promise<boolean> {
  const box1 = await page.locator(selector1).boundingBox();
  const box2 = await page.locator(selector2).boundingBox();

  if (!box1 || !box2) return false;

  const overlap = !(
    box1.x + box1.width < box2.x ||
    box2.x + box2.width < box1.x ||
    box1.y + box1.height < box2.y ||
    box2.y + box2.height < box1.y
  );

  return overlap;
}

// Helper to check color contrast
async function checkColorContrast(
  page: Page,
  selector: string
): Promise<{ ratio: number; passes: boolean }> {
  const contrast = await page.evaluate(sel => {
    const element = document.querySelector(sel);
    if (!element) return { ratio: 0, passes: false };

    const style = window.getComputedStyle(element);
    const color = style.color;
    const bgColor = style.backgroundColor;

    // Simple luminance calculation (simplified for audit purposes)
    const getRGB = (colorStr: string) => {
      const match = colorStr.match(/\d+/g);
      return match ? match.map(Number) : [0, 0, 0];
    };

    const getLuminance = (rgb: number[]) => {
      const [r, g, b] = rgb.map(val => {
        const sRGB = val / 255;
        return sRGB <= 0.03928
          ? sRGB / 12.92
          : Math.pow((sRGB + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    const fgLum = getLuminance(getRGB(color));
    const bgLum = getLuminance(getRGB(bgColor));

    const ratio =
      (Math.max(fgLum, bgLum) + 0.05) / (Math.min(fgLum, bgLum) + 0.05);
    const passes = ratio >= 4.5; // WCAG AA for normal text

    return { ratio: Math.round(ratio * 100) / 100, passes };
  }, selector);

  return contrast;
}

// Helper to check touch target size
async function _checkTouchTargetSize(
  page: Page,
  selector: string,
  minHeight = 48
): Promise<{ height: number; passes: boolean }> {
  const box = await page.locator(selector).boundingBox();
  if (!box) return { height: 0, passes: false };

  return { height: box.height, passes: box.height >= minHeight };
}

// Helper to check horizontal overflow
async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  const overflow = await page.evaluate(() => {
    return (
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth
    );
  });
  return overflow;
}

test.describe('Auth Screens UX Audit', () => {
  let screenshotDir: string;

  test.beforeAll(() => {
    // Create screenshots directory
    screenshotDir = path.join(__dirname, '../../audit-screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
  });

  test.afterAll(() => {
    // Generate comprehensive report
    const reportPath = path.join(__dirname, '../../audit-report.md');
    const report = generateReport(issues);
    fs.writeFileSync(reportPath, report);
    console.log(`\n✅ Audit complete! Report saved to: ${reportPath}`);
    console.log(`📸 Screenshots saved to: ${screenshotDir}`);
    console.log(`\n📊 Summary:`);
    console.log(
      `  P0 Critical: ${issues.filter(i => i.severity === 'P0').length}`
    );
    console.log(`  P1 High: ${issues.filter(i => i.severity === 'P1').length}`);
    console.log(
      `  P2 Medium: ${issues.filter(i => i.severity === 'P2').length}`
    );
    console.log(`  P3 Low: ${issues.filter(i => i.severity === 'P3').length}`);
    console.log(`  Total Issues: ${issues.length}`);
  });

  test.describe('Sign-In Page (/signin)', () => {
    test('Audit MethodSelector state', async ({ page }) => {
      await page.goto('http://localhost:3000/signin');
      await page.waitForSelector('h1');

      // Take screenshots at all breakpoints
      for (const viewport of VIEWPORTS) {
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        const screenshotPath = path.join(
          screenshotDir,
          `signin-method-${viewport.name}.png`
        );
        await page.screenshot({ path: screenshotPath, fullPage: true });

        // Check for horizontal overflow
        if (await hasHorizontalOverflow(page)) {
          addIssue({
            screen: '/signin',
            state: 'MethodSelector',
            severity: 'P1',
            breakpoint: `${viewport.name} (${viewport.width}x${viewport.height})`,
            title: 'Horizontal overflow detected',
            description:
              'Page has horizontal scrollbar which indicates layout breaking containment',
            screenshot: screenshotPath,
            recommendation:
              'Check container widths and ensure no fixed-width elements exceed viewport',
          });
        }

        // Check touch targets on mobile
        if (viewport.width < 768) {
          const buttons = await page.locator('button').all();
          for (let i = 0; i < buttons.length; i++) {
            const button = buttons[i];
            const box = await button.boundingBox();
            if (box && box.height < 48) {
              const text = await button.textContent();
              addIssue({
                screen: '/signin',
                state: 'MethodSelector',
                severity: 'P1',
                breakpoint: `${viewport.name} (${viewport.width}x${viewport.height})`,
                title: `Button touch target too small: "${text?.trim()}"`,
                description: `Button height is ${Math.round(box.height)}px, should be at least 48px to prevent iOS zoom and ensure easy tapping`,
                screenshot: screenshotPath,
                recommendation:
                  'Add min-h-[48px] class or ensure button padding creates sufficient height',
                codeLocation: 'apps/web/components/auth/atoms/AuthButton.tsx',
              });
            }
          }
        }
      }

      // Reset to desktop for remaining checks
      await page.setViewportSize({ width: 1440, height: 900 });

      // Check heading hierarchy
      const h1Count = await page.locator('h1').count();
      if (h1Count !== 1) {
        addIssue({
          screen: '/signin',
          state: 'MethodSelector',
          severity: 'P2',
          breakpoint: 'All',
          title: `Incorrect h1 count: ${h1Count}`,
          description:
            'Page should have exactly one h1 element for proper heading hierarchy',
          recommendation:
            'Ensure only one h1 exists, use h2-h6 for subheadings',
          wcagViolation: '1.3.1 Info and Relationships',
        });
      }

      // Check heading text
      const h1Text = await page.locator('h1').textContent();
      if (h1Text?.trim() !== 'Log in to Jovie') {
        addIssue({
          screen: '/signin',
          state: 'MethodSelector',
          severity: 'P2',
          breakpoint: 'All',
          title: 'Unexpected heading text',
          description: `Expected "Log in to Jovie" but found "${h1Text?.trim()}"`,
          codeLocation: 'apps/web/components/auth/forms/MethodSelector.tsx:158',
        });
      }

      // Check color contrast for heading
      const contrastResult = await checkColorContrast(page, 'h1');
      if (!contrastResult.passes) {
        addIssue({
          screen: '/signin',
          state: 'MethodSelector',
          severity: 'P1',
          breakpoint: 'All',
          title: 'Heading fails color contrast',
          description: `Contrast ratio is ${contrastResult.ratio}:1, needs at least 4.5:1`,
          recommendation: 'Increase color contrast between text and background',
          wcagViolation: '1.4.3 Contrast (Minimum)',
        });
      }

      // Check for skip link
      const skipLink = page.locator('a[href="#auth-form"]');
      if ((await skipLink.count()) === 0) {
        addIssue({
          screen: '/signin',
          state: 'MethodSelector',
          severity: 'P2',
          breakpoint: 'All',
          title: 'Missing skip-to-content link',
          description: 'No skip link found for keyboard users',
          recommendation: 'Add skip link as first focusable element',
          wcagViolation: '2.4.1 Bypass Blocks',
          codeLocation: 'apps/web/components/auth/AuthLayout.tsx:143-151',
        });
      }

      // Run axe accessibility audit
      const accessibilityScanResults = await new AxeBuilder({ page }).analyze();

      for (const violation of accessibilityScanResults.violations) {
        const severity =
          violation.impact === 'critical'
            ? 'P0'
            : violation.impact === 'serious'
              ? 'P1'
              : violation.impact === 'moderate'
                ? 'P2'
                : 'P3';

        addIssue({
          screen: '/signin',
          state: 'MethodSelector',
          severity,
          breakpoint: 'All',
          title: `A11y: ${violation.id}`,
          description: violation.description,
          recommendation: violation.help,
          wcagViolation: violation.tags
            .filter(t => t.startsWith('wcag'))
            .join(', '),
        });
      }
    });

    test('Audit EmailStep state', async ({ page }) => {
      await page.goto('http://localhost:3000/signin');
      await page.waitForSelector('h1');

      // Click "Continue with email"
      await page.click('button:has-text("Continue with email")');
      await page.waitForSelector('input[type="email"]', { timeout: 5000 });

      // Take screenshot
      const screenshotPath = path.join(screenshotDir, 'signin-email-step.png');
      await page.screenshot({ path: screenshotPath, fullPage: true });

      // Check email input accessibility
      const emailInput = page.locator('input[type="email"]');
      const hasLabel = await page.evaluate(selector => {
        const input = document.querySelector(selector) as HTMLInputElement;
        if (!input) return false;

        // Check for explicit label
        if (input.id) {
          const label = document.querySelector(`label[for="${input.id}"]`);
          if (label) return true;
        }

        // Check for implicit label (input wrapped in label)
        const parentLabel = input.closest('label');
        if (parentLabel) return true;

        // Check for aria-label or aria-labelledby
        if (
          input.getAttribute('aria-label') ||
          input.getAttribute('aria-labelledby')
        ) {
          return true;
        }

        return false;
      }, 'input[type="email"]');

      if (!hasLabel) {
        addIssue({
          screen: '/signin',
          state: 'EmailStep',
          severity: 'P1',
          breakpoint: 'All',
          title: 'Email input missing accessible label',
          description:
            'Input field has no associated label, aria-label, or aria-labelledby',
          recommendation: 'Add explicit <label> or aria-label attribute',
          wcagViolation:
            '1.3.1 Info and Relationships, 4.1.2 Name, Role, Value',
          codeLocation: 'apps/web/components/auth/forms/EmailStep.tsx',
        });
      }

      // Check input font size (should be >= 16px to prevent iOS zoom)
      const fontSize = await emailInput.evaluate(el => {
        return parseFloat(window.getComputedStyle(el).fontSize);
      });

      if (fontSize < 16) {
        addIssue({
          screen: '/signin',
          state: 'EmailStep',
          severity: 'P1',
          breakpoint: 'Mobile',
          title: 'Email input font size too small',
          description: `Font size is ${fontSize}px, should be at least 16px to prevent iOS zoom on focus`,
          recommendation: 'Set font-size to 16px or use text-base class',
          codeLocation: 'apps/web/components/auth/atoms/AuthInput.tsx',
        });
      }

      // Test error state
      await emailInput.fill('notanemail');
      await page.keyboard.press('Tab'); // Trigger blur
      await page.waitForTimeout(500); // Wait for validation

      // Check for error message
      const errorMessage = page.locator('[role="alert"]');
      if ((await errorMessage.count()) > 0) {
        const _errorText = await errorMessage.textContent();

        // Check error contrast
        const errorContrast = await checkColorContrast(page, '[role="alert"]');
        if (!errorContrast.passes) {
          addIssue({
            screen: '/signin',
            state: 'EmailStep - Error',
            severity: 'P1',
            breakpoint: 'All',
            title: 'Error message fails color contrast',
            description: `Error contrast ratio is ${errorContrast.ratio}:1, needs at least 4.5:1`,
            recommendation: 'Use stronger error color or darker background',
            wcagViolation: '1.4.3 Contrast (Minimum)',
          });
        }
      }
    });

    test('Audit mobile keyboard behavior', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('http://localhost:3000/signin');
      await page.waitForSelector('h1');

      // Check logo is visible initially
      const logoInitial = page
        .locator('a[aria-label="Go to homepage"]')
        .first();
      const isLogoVisible = await logoInitial.isVisible();

      await page.screenshot({
        path: path.join(screenshotDir, 'signin-mobile-keyboard-closed.png'),
        fullPage: true,
      });

      // Click email button and focus input
      await page.click('button:has-text("Continue with email")');
      await page.waitForSelector('input[type="email"]');

      // Simulate keyboard opening by reducing viewport height
      await page.setViewportSize({ width: 375, height: 500 });
      await page.locator('input[type="email"]').focus();
      await page.waitForTimeout(300); // Wait for transition

      await page.screenshot({
        path: path.join(screenshotDir, 'signin-mobile-keyboard-open.png'),
        fullPage: true,
      });

      // Check if logo is hidden
      const logoHidden = await page.evaluate(() => {
        const logo = document.querySelector(
          'a[aria-label="Go to homepage"]'
        )?.parentElement;
        if (!logo) return false;
        const style = window.getComputedStyle(logo);
        return style.opacity === '0' || style.height === '0px';
      });

      if (isLogoVisible && !logoHidden) {
        addIssue({
          screen: '/signin',
          state: 'EmailStep - Mobile Keyboard',
          severity: 'P2',
          breakpoint: 'Mobile 375x500',
          title: 'Logo not hiding when keyboard opens',
          description:
            'Logo should hide (opacity-0, h-0) when keyboard is visible to maximize form space',
          recommendation:
            'Verify useMobileKeyboard hook is working and CSS classes apply correctly',
          codeLocation: 'apps/web/components/auth/AuthLayout.tsx:176-202',
        });
      }
    });
  });

  test.describe('Sign-Up Page (/signup)', () => {
    test('Audit MethodSelector state', async ({ page }) => {
      await page.goto('http://localhost:3000/signup');
      await page.waitForSelector('h1');

      const screenshotPath = path.join(
        screenshotDir,
        'signup-method-desktop.png'
      );
      await page.screenshot({ path: screenshotPath, fullPage: true });

      // Check heading text
      const h1Text = await page.locator('h1').textContent();
      if (h1Text?.trim() !== 'Create your Jovie account') {
        addIssue({
          screen: '/signup',
          state: 'MethodSelector',
          severity: 'P2',
          breakpoint: 'All',
          title: 'Unexpected heading text',
          description: `Expected "Create your Jovie account" but found "${h1Text?.trim()}"`,
          codeLocation: 'apps/web/components/auth/forms/MethodSelector.tsx:158',
        });
      }

      // Check for legal links
      const termsLink = page.locator('a[href="/legal/terms"]');
      const privacyLink = page.locator('a[href="/legal/privacy"]');

      if ((await termsLink.count()) === 0) {
        addIssue({
          screen: '/signup',
          state: 'MethodSelector',
          severity: 'P2',
          breakpoint: 'All',
          title: 'Missing Terms link',
          description: 'Legal Terms link not found in footer',
          recommendation: 'Add Terms link to legal footer',
          codeLocation: 'apps/web/components/auth/AuthLayout.tsx:249-272',
        });
      }

      if ((await privacyLink.count()) === 0) {
        addIssue({
          screen: '/signup',
          state: 'MethodSelector',
          severity: 'P2',
          breakpoint: 'All',
          title: 'Missing Privacy Policy link',
          description: 'Privacy Policy link not found in footer',
          recommendation: 'Add Privacy Policy link to legal footer',
          codeLocation: 'apps/web/components/auth/AuthLayout.tsx:249-272',
        });
      }

      // Check footer link context
      const footerLink = page.locator('a[href="/signin"]');
      if ((await footerLink.count()) === 0) {
        addIssue({
          screen: '/signup',
          state: 'MethodSelector',
          severity: 'P2',
          breakpoint: 'All',
          title: 'Missing "Sign in" footer link',
          description: 'Footer should have link to /signin for existing users',
          codeLocation:
            'apps/web/components/auth/forms/MethodSelector.tsx:206-211',
        });
      }

      // Run axe audit
      const accessibilityScanResults = await new AxeBuilder({ page }).analyze();

      for (const violation of accessibilityScanResults.violations) {
        const severity =
          violation.impact === 'critical'
            ? 'P0'
            : violation.impact === 'serious'
              ? 'P1'
              : violation.impact === 'moderate'
                ? 'P2'
                : 'P3';

        addIssue({
          screen: '/signup',
          state: 'MethodSelector',
          severity,
          breakpoint: 'All',
          title: `A11y: ${violation.id}`,
          description: violation.description,
          recommendation: violation.help,
          wcagViolation: violation.tags
            .filter(t => t.startsWith('wcag'))
            .join(', '),
        });
      }
    });

    test('Audit responsive behavior', async ({ page }) => {
      await page.goto('http://localhost:3000/signup');

      for (const viewport of VIEWPORTS.filter(v => v.width <= 768)) {
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        const screenshotPath = path.join(
          screenshotDir,
          `signup-${viewport.name}.png`
        );
        await page.screenshot({ path: screenshotPath, fullPage: true });

        // Check legal links visibility on mobile
        const legalNav = page.locator('nav[aria-label="Legal"]');
        if ((await legalNav.count()) > 0) {
          const isVisible = await legalNav.isVisible();
          if (!isVisible) {
            addIssue({
              screen: '/signup',
              state: 'MethodSelector',
              severity: 'P3',
              breakpoint: `${viewport.name} (${viewport.width}x${viewport.height})`,
              title: 'Legal links hidden on mobile',
              description:
                'Legal links should be visible on mobile (unless keyboard is open)',
              screenshot: screenshotPath,
              codeLocation: 'apps/web/components/auth/AuthLayout.tsx:249',
            });
          }
        }
      }
    });
  });

  test.describe('Responsive Breakpoint Tests', () => {
    test('Test all screens at all breakpoints', async ({ page }) => {
      const screens = [
        { url: '/signin', name: 'signin' },
        { url: '/signup', name: 'signup' },
      ];

      for (const screen of screens) {
        for (const viewport of VIEWPORTS) {
          await page.setViewportSize({
            width: viewport.width,
            height: viewport.height,
          });
          await page.goto(`http://localhost:3000${screen.url}`);
          await page.waitForSelector('h1');

          const screenshotPath = path.join(
            screenshotDir,
            `${screen.name}-${viewport.name}-${viewport.width}x${viewport.height}.png`
          );
          await page.screenshot({ path: screenshotPath, fullPage: true });

          // Check for layout issues
          if (await hasHorizontalOverflow(page)) {
            addIssue({
              screen: screen.url,
              state: 'Initial Load',
              severity: 'P1',
              breakpoint: `${viewport.name} (${viewport.width}x${viewport.height})`,
              title: 'Horizontal scroll present',
              description:
                'Page should not have horizontal scrollbar at this breakpoint',
              screenshot: screenshotPath,
            });
          }

          // Check form max-width
          const formWidth = await page.locator('#auth-form').evaluate(el => {
            return el.getBoundingClientRect().width;
          });

          const expectedMaxWidth = viewport.width < 640 ? 320 : 352; // 20rem vs 22rem
          if (formWidth > expectedMaxWidth + 10) {
            // 10px tolerance
            addIssue({
              screen: screen.url,
              state: 'Initial Load',
              severity: 'P3',
              breakpoint: `${viewport.name} (${viewport.width}x${viewport.height})`,
              title: 'Form max-width exceeds expected value',
              description: `Form width is ${Math.round(formWidth)}px, expected max ${expectedMaxWidth}px`,
              screenshot: screenshotPath,
              codeLocation: 'apps/web/components/auth/AuthLayout.tsx:223',
            });
          }
        }
      }
    });
  });
});

// Generate markdown report
function generateReport(issues: AuditIssue[]): string {
  const now = new Date().toISOString();

  let report = `# Auth Screens UX Audit Report\n\n`;
  report += `**Generated:** ${now}\n`;
  report += `**Total Issues Found:** ${issues.length}\n\n`;

  report += `## Summary by Severity\n\n`;
  report += `- **P0 Critical:** ${issues.filter(i => i.severity === 'P0').length} issues\n`;
  report += `- **P1 High:** ${issues.filter(i => i.severity === 'P1').length} issues\n`;
  report += `- **P2 Medium:** ${issues.filter(i => i.severity === 'P2').length} issues\n`;
  report += `- **P3 Low:** ${issues.filter(i => i.severity === 'P3').length} issues\n\n`;

  report += `## Summary by Screen\n\n`;
  const screenCounts = issues.reduce(
    (acc, issue) => {
      acc[issue.screen] = (acc[issue.screen] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  for (const [screen, count] of Object.entries(screenCounts)) {
    report += `- **${screen}:** ${count} issues\n`;
  }
  report += `\n---\n\n`;

  // Group issues by severity
  const p0Issues = issues.filter(i => i.severity === 'P0');
  const p1Issues = issues.filter(i => i.severity === 'P1');
  const p2Issues = issues.filter(i => i.severity === 'P2');
  const p3Issues = issues.filter(i => i.severity === 'P3');

  const renderIssues = (issueList: AuditIssue[], severity: string) => {
    if (issueList.length === 0) return '';

    let section = `## ${severity} Issues\n\n`;

    issueList.forEach((issue, index) => {
      section += `### ${index + 1}. ${issue.title}\n\n`;
      section += `**Screen:** ${issue.screen}\n`;
      section += `**State:** ${issue.state}\n`;
      section += `**Breakpoint:** ${issue.breakpoint}\n\n`;
      section += `**Description:**\n${issue.description}\n\n`;

      if (issue.screenshot) {
        section += `**Screenshot:** \`${path.basename(issue.screenshot)}\`\n\n`;
      }

      if (issue.recommendation) {
        section += `**Recommendation:**\n${issue.recommendation}\n\n`;
      }

      if (issue.codeLocation) {
        section += `**Code Location:** \`${issue.codeLocation}\`\n\n`;
      }

      if (issue.wcagViolation) {
        section += `**WCAG Violation:** ${issue.wcagViolation}\n\n`;
      }

      section += `---\n\n`;
    });

    return section;
  };

  report += renderIssues(p0Issues, 'P0 - Critical');
  report += renderIssues(p1Issues, 'P1 - High Priority');
  report += renderIssues(p2Issues, 'P2 - Medium Priority');
  report += renderIssues(p3Issues, 'P3 - Low Priority');

  return report;
}
