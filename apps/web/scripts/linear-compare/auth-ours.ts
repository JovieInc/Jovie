/**
 * Our Dashboard Authentication Script
 *
 * Launches a headed browser for manual login to our dashboard.
 * Saves auth state for reuse in comparison scripts.
 *
 * Usage: pnpm tsx scripts/linear-compare/auth-ours.ts
 */

import { chromium } from '@playwright/test';
import * as path from 'path';

const AUTH_FILE = path.join(__dirname, '../../auth-ours.json');
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:3000';

async function authenticate() {
  console.log('🔐 Starting Our Dashboard authentication...');
  console.log(`📍 Target: ${DASHBOARD_URL}`);
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

  // Navigate to our app
  await page.goto(`${DASHBOARD_URL}/app`);

  console.log('⏳ Waiting for you to complete login...');
  console.log('   - Complete authentication flow');
  console.log('   - Wait for dashboard to load');
  console.log('');

  // Wait for dashboard shell to be visible
  await page.waitForSelector(
    '[data-testid="dashboard-shell"], [data-testid="app-shell"], main',
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
