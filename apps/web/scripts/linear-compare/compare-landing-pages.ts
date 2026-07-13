/**
 * Linear vs Our Landing Page Comparison Script
 *
 * Captures screenshots and computed styles from both landing pages
 * for pixel-perfect comparison of navigation, hero, and footer.
 *
 * No authentication required - compares public pages.
 *
 * Usage: pnpm tsx scripts/linear-compare/compare-landing-pages.ts
 */

import { chromium, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_DIR = path.join(__dirname, '../../linear-compare-output');
const OUR_URL = process.env.OUR_URL || 'http://localhost:3100';
const HEADLESS = process.env.HEADLESS !== 'false';

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

// Landing page selectors - common elements between both sites
const LINEAR_LANDING_SELECTORS = [
  { name: 'header', selector: 'header' },
  { name: 'nav', selector: 'nav' },
  { name: 'nav-link', selector: 'nav a' },
  {
    name: 'hero',
    selector: 'main section:first-of-type, [class*="hero"], [class*="Hero"]',
  },
  { name: 'hero-heading', selector: 'h1' },
  {
    name: 'hero-subheading',
    selector: 'h1 + p, [class*="hero"] p, [class*="Hero"] p',
  },
  {
    name: 'cta-button',
    selector:
      'a[href*="signup"], a[href*="start"], button[class*="primary"], [class*="cta"]',
  },
  { name: 'main', selector: 'main' },
  { name: 'footer', selector: 'footer' },
];

const OUR_LANDING_SELECTORS = [
  { name: 'header', selector: 'header' },
  { name: 'nav', selector: 'header nav' }, // Specific to header nav, not cookie consent
  { name: 'nav-link', selector: 'header nav a' }, // Specific to header nav links
  { name: 'hero', selector: 'main section:first-of-type' },
  { name: 'hero-heading', selector: 'main h1' }, // Specific to main content
  { name: 'hero-subheading', selector: 'main h1 + div p, main section p' },
  { name: 'cta-button', selector: '.btn-linear-primary' }, // Our specific CTA class
  { name: 'main', selector: 'main' },
  { name: 'footer', selector: 'footer' },
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
  const linearNum = parseFloat(linear);
  const oursNum = parseFloat(ours);

  if (!isNaN(linearNum) && !isNaN(oursNum)) {
    const diff = oursNum - linearNum;
    return diff > 0 ? `+${diff}` : `${diff}`;
  }

  return 'non-numeric';
}

function generateReport(result: ComparisonResult): string {
  let report = `# Linear vs Our Landing Page Comparison\n\n`;
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
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  console.log(`\n📊 Running landing page comparison (${mode} mode)...`);
  console.log(`   Headless: ${HEADLESS}`);

  const browser = await chromium.launch({ headless: HEADLESS });

  // Linear landing page
  console.log('📸 Capturing Linear landing page...');
  const linearContext = await browser.newContext({
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
  await linearPage.waitForLoadState('load');
  await linearPage.waitForTimeout(3000);
  await disableAnimations(linearPage);
  await waitForFonts(linearPage);

  const linearScreenshot = path.join(
    OUTPUT_DIR,
    `landing-linear-${mode}-${timestamp}.png`
  );
  await linearPage.screenshot({
    path: linearScreenshot,
    fullPage: false,
    timeout: 60000,
  });

  const linearTitle = await linearPage.title();
  console.log(`   Linear page: ${linearTitle}`);

  const linearStyles = await captureStyles(
    linearPage,
    LINEAR_LANDING_SELECTORS,
    'Linear'
  );

  await linearContext.close();

  // Our landing page
  console.log('📸 Capturing Our landing page...');
  const oursContext = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    userAgent: USER_AGENT,
  });
  const oursPage = await oursContext.newPage();
  await setColorMode(oursPage, mode);
  await oursPage.goto(OUR_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await oursPage.waitForLoadState('load');
  await oursPage.waitForTimeout(3000);
  await disableAnimations(oursPage);
  await waitForFonts(oursPage);

  const oursScreenshot = path.join(
    OUTPUT_DIR,
    `landing-ours-${mode}-${timestamp}.png`
  );
  await oursPage.screenshot({
    path: oursScreenshot,
    fullPage: false,
    timeout: 60000,
  });

  const oursTitle = await oursPage.title();
  console.log(`   Our page: ${oursTitle}`);

  const oursStyles = await captureStyles(
    oursPage,
    OUR_LANDING_SELECTORS,
    'Ours'
  );

  await oursContext.close();
  await browser.close();

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
  console.log('🔍 Linear vs Our Landing Page Comparison');
  console.log('========================================\n');

  console.log(`📡 Checking our landing page at ${OUR_URL}...`);
  try {
    const response = await fetch(OUR_URL);
    if (!response.ok) {
      console.warn(`⚠️  Landing page returned status ${response.status}`);
    } else {
      console.log('✓ Landing page is reachable');
    }
  } catch {
    console.error(`❌ Cannot reach landing page at ${OUR_URL}`);
    console.error('   Make sure the dev server is running:');
    console.error('   doppler run -- pnpm dev --port 3100');
    process.exit(1);
  }

  try {
    const lightResult = await runComparison('light');
    const darkResult = await runComparison('dark');

    const lightReport = generateReport(lightResult);
    const darkReport = generateReport(darkResult);

    const lightReportPath = path.join(
      OUTPUT_DIR,
      `landing-report-light-${lightResult.timestamp}.md`
    );
    const darkReportPath = path.join(
      OUTPUT_DIR,
      `landing-report-dark-${darkResult.timestamp}.md`
    );

    fs.writeFileSync(lightReportPath, lightReport);
    fs.writeFileSync(darkReportPath, darkReport);

    console.log('\n✅ Comparison complete!');
    console.log(`\n📄 Reports:`);
    console.log(`   Light: ${lightReportPath}`);
    console.log(`   Dark: ${darkReportPath}`);

    console.log(`\n📸 Screenshots saved to: ${OUTPUT_DIR}`);

    console.log(`\n📊 Summary:`);
    console.log(`   Light mode mismatches: ${lightResult.mismatches.length}`);
    console.log(`   Dark mode mismatches: ${darkResult.mismatches.length}`);

    const fullResults = {
      light: lightResult,
      dark: darkResult,
    };
    const jsonPath = path.join(
      OUTPUT_DIR,
      `landing-results-${lightResult.timestamp}.json`
    );
    fs.writeFileSync(jsonPath, JSON.stringify(fullResults, null, 2));
    console.log(`\n💾 Full results: ${jsonPath}`);
  } catch (error) {
    console.error('\n❌ Comparison failed:', error);
    process.exit(1);
  }
}

main();
