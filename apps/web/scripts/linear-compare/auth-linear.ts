/**
 * Linear Authentication Script
 *
 * Launches a headed browser for manual Linear login.
 * Saves auth state for reuse in comparison scripts.
 *
 * Usage: pnpm tsx scripts/linear-compare/auth-linear.ts
 */

import { chromium } from '@playwright/test';
import * as path from 'path';

const AUTH_FILE = path.join(__dirname, '../../auth-linear.json');

async function authenticate() {
  console.log('🔐 Starting Linear authentication...');
  console.log('📍 A browser window will open. Please log in manually.');
  console.log('');

  const browser = await chromium.launch({
    headless: false,
    args: ['--window-size=1440,900'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();

  // Navigate to Linear
  await page.goto('https://linear.app/login');

  console.log('⏳ Waiting for you to complete login...');
  console.log('   - Enter your email');
  console.log('   - Complete OTP or SSO');
  console.log('   - Wait for dashboard to load');
  console.log('');

  // Wait for Linear dashboard to be visible (post-auth indicator)
  // Linear uses a specific URL pattern after login
  await page.waitForURL(
    /linear\.app\/([\w-]+)\/(inbox|my-issues|projects|views|teams|settings|issue)/i,
    {
      timeout: 300000, // 5 minutes for manual login
    }
  );

  // Additional wait for full page load
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  console.log('✅ Login detected! Saving auth state...');

  // Save auth state
  await context.storageState({ path: AUTH_FILE });

  console.log(`💾 Auth state saved to: ${AUTH_FILE}`);

  await browser.close();
  console.log('🎉 Authentication complete!');
}

authenticate().catch(console.error);
