import { chromium } from '@playwright/test';

/**
 * Global Setup for Synthetic Monitoring
 *
 * Prepares the environment for synthetic tests:
 * - Validates environment configuration
 * - Sets up monitoring context
 * - Performs pre-flight checks
 */

async function globalSetup() {
  const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL || process.env.BASE_URL;

  console.log('🔧 Synthetic Monitoring Setup');
  console.log(`Environment: ${process.env.E2E_ENVIRONMENT}`);
  console.log(`Base URL: ${baseURL}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);

  // Validate required environment variables
  const requiredEnvVars = {
    E2E_SYNTHETIC_MODE: process.env.E2E_SYNTHETIC_MODE,
    E2E_ENVIRONMENT: process.env.E2E_ENVIRONMENT,
    BASE_URL: baseURL,
  };

  const missingVars = Object.entries(requiredEnvVars)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(', ')}`
    );
  }

  // Pre-flight health check
  if (baseURL) {
    console.log('🏥 Performing pre-flight health check...');

    const browser = await chromium.launch();
    const page = await browser.newPage();

    try {
      // Quick health check - just ensure the site is reachable
      await page.goto(baseURL, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      const title = await page.title();
      console.log(
        `✅ Pre-flight check passed - Site is reachable (title: "${title}")`
      );
    } catch (error) {
      console.error('❌ Pre-flight check failed:', error);
      throw new Error(`Site unreachable at ${baseURL}: ${error}`);
    } finally {
      await browser.close();
    }
  }

  // Set up monitoring context
  process.env.SYNTHETIC_RUN_ID = `synthetic-${Date.now()}`;
  process.env.SYNTHETIC_START_TIME = new Date().toISOString();

  console.log(`📊 Synthetic run ID: ${process.env.SYNTHETIC_RUN_ID}`);
  console.log('🚀 Synthetic monitoring setup complete\n');
}

export default globalSetup;
