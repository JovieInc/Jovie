/**
 * Our Dashboard Authentication Script (Simple)
 *
 * Opens our dashboard, waits for you to log in, then press Enter to save state.
 */

import { chromium } from '@playwright/test';
import * as path from 'path';
import * as readline from 'readline';

const AUTH_FILE = path.join(__dirname, '../../auth-ours.json');
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:3000';

async function authenticate() {
  console.log(`🔐 Opening ${DASHBOARD_URL}/app...`);

  const browser = await chromium.launch({
    headless: false,
    args: ['--window-size=1440,900'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();
  await page.goto(`${DASHBOARD_URL}/app`);

  // Wait for user input
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  await new Promise<void>(resolve => {
    rl.question(
      '\n✋ Press ENTER when you are logged into the dashboard... ',
      () => {
        rl.close();
        resolve();
      }
    );
  });

  console.log('💾 Saving auth state...');
  await context.storageState({ path: AUTH_FILE });

  await browser.close();
  console.log(`✅ Saved to: ${AUTH_FILE}`);
}

authenticate().catch(console.error);
