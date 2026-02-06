/**
 * Linear Token Extraction Script
 *
 * Extracts computed styles from Linear.app marketing pages and generates
 * a CSS file with design tokens in OKLCH format.
 *
 * Usage: pnpm linear:extract
 *
 * Targets:
 * - Linear homepage: https://linear.app
 * - Linear pricing: https://linear.app/pricing
 * - Linear features: https://linear.app/features
 *
 * Viewports: 375px, 768px, 1024px, 1440px
 */

import { chromium, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_DIR = path.join(__dirname, '../../linear-compare-output');
const TOKENS_OUTPUT = path.join(
  __dirname,
  '../../styles/linear-tokens.generated.css'
);
const HEADLESS = process.env.HEADLESS !== 'false';

// Viewports to test
const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1024, height: 768 },
  { name: 'wide', width: 1440, height: 900 },
];

// Pages to extract from
const LINEAR_PAGES = [
  { name: 'home', url: 'https://linear.app' },
  { name: 'pricing', url: 'https://linear.app/pricing' },
  { name: 'features', url: 'https://linear.app/features' },
];

// Selectors and their token names
const TOKEN_SELECTORS = [
  // Header/Nav
  { selector: 'header', name: 'header' },
  { selector: 'nav', name: 'nav' },
  { selector: 'nav a', name: 'nav-link' },
  { selector: 'nav button', name: 'nav-button' },

  // Typography
  { selector: 'h1', name: 'h1' },
  { selector: 'h2', name: 'h2' },
  { selector: 'h3', name: 'h3' },
  { selector: 'p', name: 'paragraph' },

  // Buttons
  {
    selector: 'a[href*="signup"], button[class*="primary"]',
    name: 'btn-primary',
  },
  { selector: 'a[href*="login"]', name: 'btn-secondary' },

  // Cards/Surfaces
  { selector: '[class*="card"], [class*="Card"]', name: 'card' },
  { selector: 'main', name: 'main' },
  { selector: 'footer', name: 'footer' },
];

// CSS properties to extract
const STYLE_PROPERTIES = [
  // Colors
  'color',
  'background-color',
  'border-color',
  // Typography
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'letter-spacing',
  // Spacing
  'padding',
  'margin',
  'gap',
  // Dimensions
  'width',
  'height',
  'max-width',
  // Borders
  'border-width',
  'border-radius',
  // Effects
  'box-shadow',
  'backdrop-filter',
  'opacity',
];

interface ExtractedStyles {
  element: string;
  selector: string;
  viewport: string;
  page: string;
  styles: Record<string, string>;
}

interface ColorToken {
  name: string;
  rgb: string;
  oklch: string;
  usage: string[];
}

/**
 * Convert RGB color string to OKLCH
 * Simplified conversion - for accurate results, use a color library
 */
function rgbToOklch(rgb: string): string {
  // Parse rgb(r, g, b) or rgba(r, g, b, a)
  const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!match) return rgb;

  const r = parseInt(match[1]) / 255;
  const g = parseInt(match[2]) / 255;
  const b = parseInt(match[3]) / 255;
  const a = match[4] ? parseFloat(match[4]) : 1;

  // Simplified sRGB to linear RGB
  const toLinear = (c: number) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);

  // Linear RGB to XYZ
  const x = 0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb;
  const y = 0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb;
  const z = 0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb;

  // XYZ to OKLAB (simplified)
  const l_ = Math.cbrt(0.8189330101 * x + 0.3618667424 * y - 0.1288597137 * z);
  const m_ = Math.cbrt(0.0329845436 * x + 0.9293118715 * y + 0.0361456387 * z);
  const s_ = Math.cbrt(0.0482003018 * x + 0.2643662691 * y + 0.633851707 * z);

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a_ok = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const b_ok = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  // OKLAB to OKLCH
  const C = Math.sqrt(a_ok * a_ok + b_ok * b_ok);
  let H = (Math.atan2(b_ok, a_ok) * 180) / Math.PI;
  if (H < 0) H += 360;

  // Format output
  const lightness = Math.round(L * 100);
  const chroma = C.toFixed(3);
  const hue = Math.round(H);

  if (a < 1) {
    return `oklch(${lightness}% ${chroma} ${hue} / ${a})`;
  }
  return `oklch(${lightness}% ${chroma} ${hue})`;
}

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

async function extractStyles(
  page: Page,
  viewport: { name: string; width: number; height: number },
  pageName: string
): Promise<ExtractedStyles[]> {
  const results: ExtractedStyles[] = [];

  for (const { selector, name } of TOKEN_SELECTORS) {
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
          viewport: viewport.name,
          page: pageName,
          styles,
        });
      }
    } catch {
      // Element not found, skip
    }
  }

  return results;
}

function extractUniqueColors(allStyles: ExtractedStyles[]): ColorToken[] {
  const colorMap = new Map<string, { usage: string[]; rgb: string }>();

  for (const item of allStyles) {
    const colorProps = ['color', 'background-color', 'border-color'];
    for (const prop of colorProps) {
      const value = item.styles[prop];
      if (value && value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent') {
        const key = value;
        if (!colorMap.has(key)) {
          colorMap.set(key, { usage: [], rgb: value });
        }
        colorMap.get(key)!.usage.push(`${item.element}.${prop}`);
      }
    }
  }

  const tokens: ColorToken[] = [];
  let index = 1;

  for (const [rgb, data] of colorMap) {
    tokens.push({
      name: `color-${index}`,
      rgb,
      oklch: rgbToOklch(rgb),
      usage: [...new Set(data.usage)],
    });
    index++;
  }

  return tokens;
}

function generateCSSTokens(
  colors: ColorToken[],
  allStyles: ExtractedStyles[]
): string {
  let css = `/**
 * Linear Design Tokens (Auto-Generated)
 *
 * Generated from Linear.app on ${new Date().toISOString()}
 * DO NOT EDIT MANUALLY - run pnpm linear:extract to regenerate
 *
 * Colors extracted and converted to OKLCH format.
 */

:root {
  /* ============================================
     EXTRACTED COLORS
     ============================================ */

`;

  // Group colors by type
  const textColors = colors.filter(c =>
    c.usage.some(u => u.includes('.color'))
  );
  const bgColors = colors.filter(c =>
    c.usage.some(u => u.includes('background-color'))
  );
  const borderColors = colors.filter(c =>
    c.usage.some(u => u.includes('border-color'))
  );

  css += '  /* Text Colors */\n';
  for (const color of textColors) {
    css += `  /* ${color.rgb} - used in: ${color.usage.join(', ')} */\n`;
    css += `  --linear-extracted-${color.name}: ${color.oklch};\n\n`;
  }

  css += '\n  /* Background Colors */\n';
  for (const color of bgColors) {
    css += `  /* ${color.rgb} - used in: ${color.usage.join(', ')} */\n`;
    css += `  --linear-extracted-bg-${color.name}: ${color.oklch};\n\n`;
  }

  css += '\n  /* Border Colors */\n';
  for (const color of borderColors) {
    css += `  /* ${color.rgb} - used in: ${color.usage.join(', ')} */\n`;
    css += `  --linear-extracted-border-${color.name}: ${color.oklch};\n\n`;
  }

  // Extract typography patterns
  css += `
  /* ============================================
     EXTRACTED TYPOGRAPHY
     ============================================ */

`;

  const seenTypography = new Set<string>();
  for (const item of allStyles) {
    const key = `${item.element}-${item.viewport}`;
    if (seenTypography.has(key)) continue;
    seenTypography.add(key);

    if (['h1', 'h2', 'h3', 'paragraph', 'nav-link'].includes(item.element)) {
      css += `  /* ${item.element} (${item.viewport}) */\n`;
      css += `  --linear-extracted-${item.element}-${item.viewport}-size: ${item.styles['font-size']};\n`;
      css += `  --linear-extracted-${item.element}-${item.viewport}-weight: ${item.styles['font-weight']};\n`;
      css += `  --linear-extracted-${item.element}-${item.viewport}-leading: ${item.styles['line-height']};\n`;
      css += `  --linear-extracted-${item.element}-${item.viewport}-tracking: ${item.styles['letter-spacing']};\n\n`;
    }
  }

  css += '}\n';

  return css;
}

async function main() {
  console.log('🎨 Linear Token Extraction');
  console.log('==========================\n');

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ headless: HEADLESS });
  const allStyles: ExtractedStyles[] = [];

  try {
    for (const linearPage of LINEAR_PAGES) {
      console.log(
        `\n📄 Extracting from ${linearPage.name} (${linearPage.url})`
      );

      for (const viewport of VIEWPORTS) {
        console.log(
          `   📐 Viewport: ${viewport.name} (${viewport.width}x${viewport.height})`
        );

        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: 2,
        });
        const page = await context.newPage();

        await page.emulateMedia({ colorScheme: 'dark' });
        await page.goto(linearPage.url, {
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        });
        await page.waitForLoadState('load');
        await page.waitForTimeout(2000);
        await disableAnimations(page);
        await waitForFonts(page);

        const styles = await extractStyles(page, viewport, linearPage.name);
        allStyles.push(...styles);

        console.log(`      ✓ Extracted ${styles.length} elements`);

        // Take screenshot
        const screenshotPath = path.join(
          OUTPUT_DIR,
          `linear-${linearPage.name}-${viewport.name}.png`
        );
        await page.screenshot({ path: screenshotPath, fullPage: false });

        await context.close();
      }
    }

    // Extract unique colors
    console.log('\n🎨 Extracting unique colors...');
    const colors = extractUniqueColors(allStyles);
    console.log(`   Found ${colors.length} unique colors`);

    // Generate CSS
    console.log('\n📝 Generating CSS tokens...');
    const cssContent = generateCSSTokens(colors, allStyles);
    fs.writeFileSync(TOKENS_OUTPUT, cssContent);
    console.log(`   ✓ Written to ${TOKENS_OUTPUT}`);

    // Save raw data
    const jsonPath = path.join(OUTPUT_DIR, 'linear-extracted-styles.json');
    fs.writeFileSync(
      jsonPath,
      JSON.stringify({ styles: allStyles, colors }, null, 2)
    );
    console.log(`   ✓ Raw data saved to ${jsonPath}`);

    console.log('\n✅ Token extraction complete!');
    console.log('\nNext steps:');
    console.log(
      '1. Review the generated tokens in linear-tokens.generated.css'
    );
    console.log('2. Compare with styles/linear-tokens.css');
    console.log('3. Update linear-tokens.css with any new values');
  } catch (error) {
    console.error('\n❌ Extraction failed:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
