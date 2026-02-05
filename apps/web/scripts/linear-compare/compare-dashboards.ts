/**
 * Linear vs Our Dashboard Comparison Script
 *
 * Captures screenshots and computed styles from both dashboards
 * for pixel-perfect comparison of the app shell and sidebar.
 *
 * Prerequisites:
 * 1. Start dev server with Doppler: doppler run -- pnpm dev:local
 *    (on port 3100, or set DASHBOARD_URL env var)
 * 2. Run E2E tests once to generate auth: pnpm e2e:smoke
 * 3. Manually authenticate Linear: pnpm tsx scripts/linear-compare/auth-linear-simple.ts
 *
 * Usage: pnpm tsx scripts/linear-compare/compare-dashboards.ts
 *
 * Environment variables:
 *   DASHBOARD_URL - URL of our dashboard (default: http://localhost:3100)
 *   HEADLESS - Set to 'false' to run in headed mode for debugging
 */

import { chromium, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const LINEAR_AUTH = path.join(__dirname, '../../auth-linear.json');
// Use the E2E auth file which has proper Clerk testing tokens
const OURS_AUTH = path.join(__dirname, '../../tests/.auth/user.json');
const OUTPUT_DIR = path.join(__dirname, '../../linear-compare-output');
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:3100'; // Match E2E port
const HEADLESS = process.env.HEADLESS !== 'false'; // Set HEADLESS=false to debug

// Rendering normalization settings
const VIEWPORT = { width: 1440, height: 900 };
const DEVICE_SCALE_FACTOR = 2;
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface ComputedStyles {
  element: string;
  selector: string;
  styles: Record<string, string>;
}

interface ComparisonResult {
  timestamp: string;
  mode: 'light' | 'dark';
  linear: {
    screenshot: string;
    styles: ComputedStyles[];
  };
  ours: {
    screenshot: string;
    styles: ComputedStyles[];
  };
  mismatches: StyleMismatch[];
}

interface StyleMismatch {
  component: string;
  property: string;
  linearValue: string;
  ourValue: string;
  delta: string;
}

// CSS properties to capture for comparison
const STYLE_PROPERTIES = [
  // Typography
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'letter-spacing',
  'color',
  // Spacing
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'gap',
  // Dimensions
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
  // Borders
  'border-width',
  'border-color',
  'border-radius',
  'border-style',
  // Background
  'background-color',
  'background-image',
  // Effects
  'box-shadow',
  'opacity',
  // Layout
  'display',
  'flex-direction',
  'align-items',
  'justify-content',
  // Transitions
  'transition-duration',
  'transition-timing-function',
  'transition-property',
];

async function disableAnimations(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }
    `,
  });
}

async function waitForFonts(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
}

async function setColorMode(page: Page, mode: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({ colorScheme: mode });
  await page.waitForTimeout(100);
}

async function captureStyles(
  page: Page,
  selectors: { name: string; selector: string }[],
  debugLabel: string = ''
): Promise<ComputedStyles[]> {
  const results: ComputedStyles[] = [];
  const notFound: string[] = [];

  for (const { name, selector } of selectors) {
    try {
      const styles = await page.evaluate(
        ({ sel, props }) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const computed = window.getComputedStyle(el);
          const result: Record<string, string> = {};
          for (const prop of props) {
            result[prop] = computed.getPropertyValue(prop);
          }
          return result;
        },
        { sel: selector, props: STYLE_PROPERTIES }
      );

      if (styles) {
        results.push({
          element: name,
          selector,
          styles,
        });
      } else {
        notFound.push(`${name} (${selector})`);
      }
    } catch {
      console.warn(`Could not capture styles for ${name} (${selector})`);
      notFound.push(`${name} (${selector})`);
    }
  }

  if (notFound.length > 0) {
    console.warn(
      `⚠️  ${debugLabel} - Elements not found: ${notFound.join(', ')}`
    );
  }
  console.log(
    `✓ ${debugLabel} - Found ${results.length}/${selectors.length} elements`
  );

  return results;
}

// Linear-specific selectors for app shell components
const LINEAR_SELECTORS = [
  {
    name: 'sidebar',
    selector: 'aside, [class*="Sidebar"], nav[class*="side"]',
  },
  {
    name: 'sidebar-item',
    selector: 'aside a, aside button, [class*="SidebarItem"]',
  },
  { name: 'sidebar-group', selector: '[class*="Group"], [class*="Section"]' },
  {
    name: 'app-shell',
    selector: '#__next > div, [class*="Layout"], body > div',
  },
  { name: 'header', selector: 'header, [class*="Header"], [class*="Toolbar"]' },
  {
    name: 'main-content',
    selector: 'main, [class*="Main"], [class*="Content"]',
  },
];

// Our dashboard selectors (based on Jovie codebase analysis)
const OUR_SELECTORS = [
  { name: 'sidebar', selector: '[data-sidebar="sidebar"]' },
  { name: 'sidebar-item', selector: '[data-sidebar="menu-button"]' },
  { name: 'sidebar-group', selector: '[data-sidebar="group"]' },
  { name: 'app-shell', selector: '[class*="group/sidebar-wrapper"]' },
  { name: 'header', selector: '[data-testid="dashboard-header"]' },
  { name: 'main-content', selector: 'main, [data-sidebar="inset"]' },
  { name: 'sidebar-content', selector: '[data-sidebar="content"]' },
  { name: 'sidebar-header', selector: '[data-sidebar="header"]' },
  { name: 'sidebar-footer', selector: '[data-sidebar="footer"]' },
];

function compareStyles(
  linearStyles: ComputedStyles[],
  ourStyles: ComputedStyles[]
): StyleMismatch[] {
  const mismatches: StyleMismatch[] = [];

  for (const linearItem of linearStyles) {
    const ourItem = ourStyles.find(o => o.element === linearItem.element);
    if (!ourItem) {
      mismatches.push({
        component: linearItem.element,
        property: 'existence',
        linearValue: 'present',
        ourValue: 'missing',
        delta: 'Element not found',
      });
      continue;
    }

    for (const [prop, linearValue] of Object.entries(linearItem.styles)) {
      const ourValue = ourItem.styles[prop] || 'unset';
      if (linearValue !== ourValue) {
        mismatches.push({
          component: linearItem.element,
          property: prop,
          linearValue,
          ourValue,
          delta: calculateDelta(prop, linearValue, ourValue),
        });
      }
    }
  }

  return mismatches;
}

function calculateDelta(prop: string, linear: string, ours: string): string {
  // Try to calculate numeric delta for dimensional properties
  const linearNum = parseFloat(linear);
  const oursNum = parseFloat(ours);

  if (!isNaN(linearNum) && !isNaN(oursNum)) {
    const diff = oursNum - linearNum;
    return diff > 0 ? `+${diff}` : `${diff}`;
  }

  return 'non-numeric';
}

function generateReport(result: ComparisonResult): string {
  let report = `# Linear vs Our Dashboard Comparison\n\n`;
  report += `**Timestamp:** ${result.timestamp}\n`;
  report += `**Mode:** ${result.mode}\n\n`;

  report += `## Screenshots\n\n`;
  report += `- Linear: ${result.linear.screenshot}\n`;
  report += `- Ours: ${result.ours.screenshot}\n\n`;

  if (result.mismatches.length === 0) {
    report += `## ✅ No mismatches found!\n`;
    return report;
  }

  report += `## Mismatches (${result.mismatches.length})\n\n`;
  report += `| Component | Property | Linear | Ours | Delta |\n`;
  report += `|-----------|----------|--------|------|-------|\n`;

  for (const m of result.mismatches) {
    report += `| ${m.component} | ${m.property} | \`${m.linearValue}\` | \`${m.ourValue}\` | ${m.delta} |\n`;
  }

  report += `\n## Recommendations\n\n`;

  // Group mismatches by component
  const byComponent = new Map<string, StyleMismatch[]>();
  for (const m of result.mismatches) {
    if (!byComponent.has(m.component)) {
      byComponent.set(m.component, []);
    }
    byComponent.get(m.component)!.push(m);
  }

  for (const [component, mismatches] of byComponent) {
    report += `### ${component}\n\n`;
    report += `\`\`\`css\n`;
    for (const m of mismatches) {
      if (m.property !== 'existence') {
        report += `${m.property}: ${m.linearValue}; /* currently: ${m.ourValue} */\n`;
      }
    }
    report += `\`\`\`\n\n`;
  }

  return report;
}

async function runComparison(
  mode: 'light' | 'dark'
): Promise<ComparisonResult> {
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Check for auth files
  if (!fs.existsSync(LINEAR_AUTH)) {
    throw new Error(
      `Linear auth not found. Run: pnpm tsx scripts/linear-compare/auth-linear.ts`
    );
  }
  if (!fs.existsSync(OURS_AUTH)) {
    throw new Error(
      `Our auth not found. Run E2E tests first to generate auth: pnpm e2e:smoke\n` +
        `Or run: doppler run -- pnpm tsx scripts/linear-compare/auth-ours-simple.ts`
    );
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  console.log(`\n📊 Running comparison (${mode} mode)...`);
  console.log(`   Headless: ${HEADLESS}`);

  // Launch browsers
  const browser = await chromium.launch({ headless: HEADLESS });

  // Linear context
  console.log('📸 Capturing Linear...');
  const linearContext = await browser.newContext({
    storageState: LINEAR_AUTH,
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    userAgent: USER_AGENT,
  });
  const linearPage = await linearContext.newPage();
  await setColorMode(linearPage, mode);
  await linearPage.goto('https://linear.app', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await linearPage.waitForTimeout(3000); // Wait for SPA to render
  await disableAnimations(linearPage);
  await waitForFonts(linearPage);

  const linearScreenshot = path.join(
    OUTPUT_DIR,
    `linear-${mode}-${timestamp}.png`
  );
  await linearPage.screenshot({ path: linearScreenshot, fullPage: false });

  // Debug: print page title and URL
  const linearTitle = await linearPage.title();
  const linearUrl = linearPage.url();
  console.log(`   Linear page: ${linearTitle} (${linearUrl})`);

  const linearStyles = await captureStyles(
    linearPage,
    LINEAR_SELECTORS,
    'Linear'
  );

  await linearContext.close();

  // Our context
  console.log('📸 Capturing Ours...');
  const oursContext = await browser.newContext({
    storageState: OURS_AUTH,
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    userAgent: USER_AGENT,
  });
  const oursPage = await oursContext.newPage();
  await setColorMode(oursPage, mode);
  await oursPage.goto(`${DASHBOARD_URL}/app`, {
    waitUntil: 'networkidle',
    timeout: 60000,
  });

  // Wait for any client-side redirects to complete
  await oursPage.waitForLoadState('networkidle');
  await oursPage.waitForTimeout(3000); // Wait for hydration

  // Log current URL to debug any redirects
  const currentUrl = oursPage.url();
  console.log(`   After navigation: ${currentUrl}`);

  await disableAnimations(oursPage);
  await waitForFonts(oursPage);

  const oursScreenshot = path.join(OUTPUT_DIR, `ours-${mode}-${timestamp}.png`);
  await oursPage.screenshot({ path: oursScreenshot, fullPage: false });

  // Debug: print page title and URL
  const oursTitle = await oursPage.title();
  const oursUrl = oursPage.url();
  console.log(`   Our page: ${oursTitle} (${oursUrl})`);

  const oursStyles = await captureStyles(oursPage, OUR_SELECTORS, 'Ours');

  await oursContext.close();
  await browser.close();

  // Compare
  const mismatches = compareStyles(linearStyles, oursStyles);

  return {
    timestamp,
    mode,
    linear: {
      screenshot: linearScreenshot,
      styles: linearStyles,
    },
    ours: {
      screenshot: oursScreenshot,
      styles: oursStyles,
    },
    mismatches,
  };
}

async function main() {
  console.log('🔍 Linear vs Our Dashboard Comparison');
  console.log('=====================================\n');

  // Quick sanity check for dashboard URL
  console.log(`📡 Checking dashboard at ${DASHBOARD_URL}...`);
  try {
    const response = await fetch(`${DASHBOARD_URL}/app`);
    if (!response.ok) {
      console.warn(`⚠️  Dashboard returned status ${response.status}`);
    } else {
      console.log('✓ Dashboard is reachable');
    }
  } catch {
    console.error(`❌ Cannot reach dashboard at ${DASHBOARD_URL}`);
    console.error('   Make sure the dev server is running:');
    console.error('   doppler run -- pnpm dev:local --port 3100');
    process.exit(1);
  }

  try {
    // Run both light and dark mode comparisons
    const lightResult = await runComparison('light');
    const darkResult = await runComparison('dark');

    // Generate reports
    const lightReport = generateReport(lightResult);
    const darkReport = generateReport(darkResult);

    const lightReportPath = path.join(
      OUTPUT_DIR,
      `report-light-${lightResult.timestamp}.md`
    );
    const darkReportPath = path.join(
      OUTPUT_DIR,
      `report-dark-${darkResult.timestamp}.md`
    );

    fs.writeFileSync(lightReportPath, lightReport);
    fs.writeFileSync(darkReportPath, darkReport);

    console.log('\n✅ Comparison complete!');
    console.log(`\n📄 Reports:`);
    console.log(`   Light: ${lightReportPath}`);
    console.log(`   Dark: ${darkReportPath}`);

    console.log(`\n📸 Screenshots saved to: ${OUTPUT_DIR}`);

    // Print summary
    console.log(`\n📊 Summary:`);
    console.log(`   Light mode mismatches: ${lightResult.mismatches.length}`);
    console.log(`   Dark mode mismatches: ${darkResult.mismatches.length}`);

    // Save full results as JSON
    const fullResults = {
      light: lightResult,
      dark: darkResult,
    };
    const jsonPath = path.join(
      OUTPUT_DIR,
      `results-${lightResult.timestamp}.json`
    );
    fs.writeFileSync(jsonPath, JSON.stringify(fullResults, null, 2));
    console.log(`\n💾 Full results: ${jsonPath}`);
  } catch (error) {
    console.error('\n❌ Comparison failed:', error);
    process.exit(1);
  }
}

main();
