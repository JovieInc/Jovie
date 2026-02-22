/**
 * Quick Auth Screen UX Audit
 *
 * Faster standalone script to audit auth screens
 * Run with: pnpm tsx scripts/quick-auth-audit.ts
 */

import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'http://localhost:3000';

interface Issue {
  screen: string;
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  title: string;
  description: string;
  screenshot?: string;
}

const issues: Issue[] = [];

async function runAudit() {
  console.log('🔍 Starting Quick Auth UX Audit...\n');

  const browser = await chromium.launch({ headless: true });
  const screenshotsDir = path.join(__dirname, '../audit-screenshots');

  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  try {
    // Test /signin
    await auditSignIn(browser, screenshotsDir);

    // Test /signup
    await auditSignUp(browser, screenshotsDir);

    // Generate report
    generateReport(issues, screenshotsDir);
  } finally {
    await browser.close();
  }
}

async function auditSignIn(browser: any, screenshotsDir: string) {
  console.log('📋 Auditing /signin page...');

  const page = await browser.newPage();
  await page.goto(`${BASE_URL}/signin`);
  await page.waitForSelector('h1');

  // Take desktop screenshot
  await page.setViewportSize({ width: 1440, height: 900 });
  const desktopScreenshot = path.join(
    screenshotsDir,
    'signin-desktop-1440x900.png'
  );
  await page.screenshot({ path: desktopScreenshot, fullPage: true });
  console.log(`  ✅ Desktop screenshot: ${path.basename(desktopScreenshot)}`);

  // Check heading
  const h1Text = await page.locator('h1').textContent();
  if (h1Text?.trim() !== 'Log in to Jovie') {
    issues.push({
      screen: '/signin',
      severity: 'P2',
      title: 'Incorrect heading text',
      description: `Expected "Log in to Jovie" but found "${h1Text?.trim()}"`,
      screenshot: desktopScreenshot,
    });
    console.log(`  ⚠️  Issue found: Incorrect heading text`);
  }

  // Check for skip link
  const skipLink = await page.locator('a[href="#auth-form"]').count();
  if (skipLink === 0) {
    issues.push({
      screen: '/signin',
      severity: 'P2',
      title: 'Missing skip-to-content link',
      description: 'No accessibility skip link found for keyboard users',
    });
    console.log(`  ⚠️  Issue found: Missing skip link`);
  }

  // Check buttons exist
  const googleBtn = await page
    .locator('button:has-text("Continue with Google")')
    .count();
  const emailBtn = await page
    .locator('button:has-text("Continue with email")')
    .count();

  if (googleBtn === 0 || emailBtn === 0) {
    issues.push({
      screen: '/signin',
      severity: 'P0',
      title: 'Missing auth method buttons',
      description: `Google: ${googleBtn}, Email: ${emailBtn}`,
      screenshot: desktopScreenshot,
    });
    console.log(`  🚨 Critical issue: Missing auth buttons`);
  }

  // Mobile test
  await page.setViewportSize({ width: 375, height: 667 });
  const mobileScreenshot = path.join(
    screenshotsDir,
    'signin-mobile-375x667.png'
  );
  await page.screenshot({ path: mobileScreenshot, fullPage: true });
  console.log(`  ✅ Mobile screenshot: ${path.basename(mobileScreenshot)}`);

  // Check touch targets on mobile
  const buttons = await page.locator('button').all();
  for (const button of buttons) {
    const box = await button.boundingBox();
    if (box && box.height < 48) {
      const text = await button.textContent();
      issues.push({
        screen: '/signin',
        severity: 'P1',
        title: `Touch target too small: "${text?.trim()}"`,
        description: `Button height is ${Math.round(box.height)}px, should be at least 48px`,
        screenshot: mobileScreenshot,
      });
      console.log(`  ⚠️  Issue found: Button too small - ${text?.trim()}`);
    }
  }

  // Check horizontal overflow
  const hasOverflow = await page.evaluate(() => {
    return (
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth
    );
  });

  if (hasOverflow) {
    issues.push({
      screen: '/signin',
      severity: 'P1',
      title: 'Horizontal overflow on mobile',
      description: 'Page has horizontal scrollbar',
      screenshot: mobileScreenshot,
    });
    console.log(`  ⚠️  Issue found: Horizontal overflow`);
  }

  // Test email step
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.click('button:has-text("Continue with email")');
  await page
    .waitForSelector('input[type="email"]', { timeout: 5000 })
    .catch(() => {
      issues.push({
        screen: '/signin',
        severity: 'P0',
        title: 'Email step failed to load',
        description:
          'Email input did not appear after clicking Continue with email',
      });
      console.log(`  🚨 Critical issue: Email step failed to load`);
    });

  const emailScreenshot = path.join(screenshotsDir, 'signin-email-step.png');
  await page.screenshot({ path: emailScreenshot, fullPage: true });
  console.log(`  ✅ Email step screenshot: ${path.basename(emailScreenshot)}`);

  // Check email input font size
  const emailInput = page.locator('input[type="email"]');
  if ((await emailInput.count()) > 0) {
    const fontSize = await emailInput.evaluate((el: HTMLElement) => {
      return parseFloat(window.getComputedStyle(el).fontSize);
    });

    if (fontSize < 16) {
      issues.push({
        screen: '/signin',
        severity: 'P1',
        title: 'Email input font too small',
        description: `Font size is ${fontSize}px, should be >= 16px to prevent iOS zoom`,
        screenshot: emailScreenshot,
      });
      console.log(`  ⚠️  Issue found: Font size too small (${fontSize}px)`);
    }
  }

  await page.close();
  console.log('✅ /signin audit complete\n');
}

async function auditSignUp(browser: any, screenshotsDir: string) {
  console.log('📋 Auditing /signup page...');

  const page = await browser.newPage();
  await page.goto(`${BASE_URL}/signup`);
  await page.waitForSelector('h1');

  // Desktop screenshot
  await page.setViewportSize({ width: 1440, height: 900 });
  const desktopScreenshot = path.join(
    screenshotsDir,
    'signup-desktop-1440x900.png'
  );
  await page.screenshot({ path: desktopScreenshot, fullPage: true });
  console.log(`  ✅ Desktop screenshot: ${path.basename(desktopScreenshot)}`);

  // Check heading
  const h1Text = await page.locator('h1').textContent();
  if (h1Text?.trim() !== 'Create your Jovie account') {
    issues.push({
      screen: '/signup',
      severity: 'P2',
      title: 'Incorrect heading text',
      description: `Expected "Create your Jovie account" but found "${h1Text?.trim()}"`,
      screenshot: desktopScreenshot,
    });
    console.log(`  ⚠️  Issue found: Incorrect heading text`);
  }

  // Check for legal links
  const termsLink = await page.locator('a[href="/legal/terms"]').count();
  const privacyLink = await page.locator('a[href="/legal/privacy"]').count();

  if (termsLink === 0) {
    issues.push({
      screen: '/signup',
      severity: 'P2',
      title: 'Missing Terms link',
      description: 'Legal Terms link not found',
    });
    console.log(`  ⚠️  Issue found: Missing Terms link`);
  }

  if (privacyLink === 0) {
    issues.push({
      screen: '/signup',
      severity: 'P2',
      title: 'Missing Privacy Policy link',
      description: 'Privacy Policy link not found',
    });
    console.log(`  ⚠️  Issue found: Missing Privacy link`);
  }

  // Check footer link
  const signinLink = await page.locator('a[href="/signin"]').count();
  if (signinLink === 0) {
    issues.push({
      screen: '/signup',
      severity: 'P2',
      title: 'Missing sign in link',
      description: 'Footer should have link to /signin for existing users',
    });
    console.log(`  ⚠️  Issue found: Missing signin link`);
  }

  // Mobile screenshot
  await page.setViewportSize({ width: 375, height: 667 });
  const mobileScreenshot = path.join(
    screenshotsDir,
    'signup-mobile-375x667.png'
  );
  await page.screenshot({ path: mobileScreenshot, fullPage: true });
  console.log(`  ✅ Mobile screenshot: ${path.basename(mobileScreenshot)}`);

  await page.close();
  console.log('✅ /signup audit complete\n');
}

function generateReport(issues: Issue[], screenshotsDir: string) {
  const reportPath = path.join(__dirname, '../audit-report.md');

  const p0 = issues.filter(i => i.severity === 'P0');
  const p1 = issues.filter(i => i.severity === 'P1');
  const p2 = issues.filter(i => i.severity === 'P2');
  const p3 = issues.filter(i => i.severity === 'P3');

  let report = `# Auth Screens UX Audit Report\n\n`;
  report += `**Generated:** ${new Date().toISOString()}\n`;
  report += `**Total Issues:** ${issues.length}\n\n`;

  report += `## Summary\n\n`;
  report += `- 🚨 **P0 Critical:** ${p0.length} issues\n`;
  report += `- ⚠️  **P1 High:** ${p1.length} issues\n`;
  report += `- ⚠️  **P2 Medium:** ${p2.length} issues\n`;
  report += `- ℹ️  **P3 Low:** ${p3.length} issues\n\n`;

  report += `---\n\n`;

  const renderIssues = (list: Issue[], severity: string) => {
    if (list.length === 0) return '';

    let section = `## ${severity} Issues\n\n`;
    list.forEach((issue, idx) => {
      section += `### ${idx + 1}. ${issue.title}\n\n`;
      section += `**Screen:** ${issue.screen}\n`;
      section += `**Description:** ${issue.description}\n`;
      if (issue.screenshot) {
        section += `**Screenshot:** \`${path.basename(issue.screenshot)}\`\n`;
      }
      section += `\n---\n\n`;
    });
    return section;
  };

  report += renderIssues(p0, '🚨 P0 - Critical');
  report += renderIssues(p1, '⚠️  P1 - High Priority');
  report += renderIssues(p2, '⚠️  P2 - Medium Priority');
  report += renderIssues(p3, 'ℹ️  P3 - Low Priority');

  fs.writeFileSync(reportPath, report);

  console.log('\n═══════════════════════════════════════');
  console.log('📊 AUDIT COMPLETE');
  console.log('═══════════════════════════════════════\n');
  console.log(`Total Issues Found: ${issues.length}`);
  console.log(`  🚨 P0 Critical: ${p0.length}`);
  console.log(`  ⚠️  P1 High: ${p1.length}`);
  console.log(`  ⚠️  P2 Medium: ${p2.length}`);
  console.log(`  ℹ️  P3 Low: ${p3.length}`);
  console.log(`\n📄 Report saved to: ${reportPath}`);
  console.log(`📸 Screenshots saved to: ${screenshotsDir}\n`);

  if (p0.length > 0) {
    console.log('🚨 CRITICAL ISSUES FOUND - Immediate action required!\n');
    p0.forEach(issue => {
      console.log(`   - ${issue.screen}: ${issue.title}`);
    });
    console.log('');
  }
}

runAudit().catch(console.error);
