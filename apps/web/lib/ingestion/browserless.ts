/**
 * Browserless Integration for Bot-Protected Sites
 *
 * Uses Browserless.io's connect API for cost-optimized browser automation.
 * Designed for sites that block server-side requests (like Thematic).
 *
 * Cost Optimization:
 * - Browserless charges per 30-second blocks
 * - We optimize for <15s execution to stay in one billing block
 * - Block images/fonts/CSS to speed up page load
 * - Exit immediately after extracting data
 *
 * Environment Variables:
 * - BROWSERLESS_API_KEY: Your Browserless API key
 * - BROWSERLESS_ENDPOINT: Optional custom endpoint (default: wss://chrome.browserless.io)
 */

import { logger } from '@/lib/utils/logger';

// ============================================================================
// Configuration
// ============================================================================

const BROWSERLESS_CONFIG = {
  /** Default endpoint for Browserless WebSocket connection */
  defaultEndpoint: 'wss://chrome.browserless.io',
  /** Maximum time to wait for page load (ms) - stay under 30s billing block */
  pageLoadTimeout: 10000,
  /** Maximum time for entire operation (ms) */
  operationTimeout: 15000,
  /** Viewport size - smaller = faster rendering */
  viewport: { width: 1280, height: 720 },
} as const;

/** Resource types to block for faster page loads */
const BLOCKED_RESOURCE_TYPES = new Set([
  'image',
  'media',
  'font',
  'stylesheet',
  'other',
]);

/** URL patterns to block (tracking, analytics, ads) */
const BLOCKED_URL_PATTERNS = [
  '*google-analytics*',
  '*googletagmanager*',
  '*facebook.net*',
  '*doubleclick*',
  '*hotjar*',
  '*segment*',
  '*mixpanel*',
  '*amplitude*',
  '*intercom*',
  '*crisp*',
  '*zendesk*',
];

// ============================================================================
// Types
// ============================================================================

export interface BrowserlessOptions {
  /** URL to fetch */
  url: string;
  /** Maximum time to wait for page load (default: 10000ms) */
  pageLoadTimeout?: number;
  /** Maximum time for entire operation (default: 15000ms) */
  operationTimeout?: number;
  /** Wait for a specific selector before extracting HTML */
  waitForSelector?: string;
  /** Block resource types for faster loading */
  blockResources?: boolean;
}

export interface BrowserlessResult {
  /** Raw HTML content of the page */
  html: string;
  /** Final URL after redirects */
  finalUrl: string;
  /** Time taken in milliseconds */
  durationMs: number;
}

export class BrowserlessError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'NO_API_KEY'
      | 'CONNECTION_FAILED'
      | 'TIMEOUT'
      | 'PAGE_ERROR'
      | 'EXTRACTION_FAILED'
  ) {
    super(message);
    this.name = 'BrowserlessError';
  }
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Check if Browserless is configured (API key is set)
 */
export function isBrowserlessConfigured(): boolean {
  return !!process.env.BROWSERLESS_API_KEY;
}

/**
 * Get the Browserless WebSocket endpoint URL with API key
 */
function getBrowserlessEndpoint(): string {
  const apiKey = process.env.BROWSERLESS_API_KEY;
  if (!apiKey) {
    throw new BrowserlessError(
      'BROWSERLESS_API_KEY environment variable is not set',
      'NO_API_KEY'
    );
  }

  const baseEndpoint =
    process.env.BROWSERLESS_ENDPOINT || BROWSERLESS_CONFIG.defaultEndpoint;

  // Add API key and optimization params
  const params = new URLSearchParams({
    token: apiKey,
    // Block ads for faster loading
    blockAds: 'true',
    // Stealth mode to avoid bot detection
    stealth: 'true',
  });

  return `${baseEndpoint}?${params.toString()}`;
}

/**
 * Fetch a page using Browserless with cost optimization.
 *
 * Uses Playwright's connect API to connect to Browserless's hosted browser.
 * Optimized to complete within one 30-second billing block.
 *
 * @example
 * ```ts
 * const result = await fetchWithBrowserless({
 *   url: 'https://app.hellothematic.com/artist/profile/123456',
 *   waitForSelector: '[data-testid="profile"]',
 * });
 * console.log(result.html);
 * ```
 */
export async function fetchWithBrowserless(
  options: BrowserlessOptions
): Promise<BrowserlessResult> {
  const {
    url,
    pageLoadTimeout = BROWSERLESS_CONFIG.pageLoadTimeout,
    operationTimeout = BROWSERLESS_CONFIG.operationTimeout,
    waitForSelector,
    blockResources = true,
  } = options;

  const startTime = Date.now();

  // Dynamic import to avoid loading Playwright in non-browser contexts
  const { chromium } = await import('playwright-core');

  const endpoint = getBrowserlessEndpoint();

  let browser;
  let context;
  let page;

  try {
    // Connect to Browserless with timeout
    browser = await Promise.race([
      chromium.connectOverCDP(endpoint),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new BrowserlessError('Connection timeout', 'TIMEOUT')),
          5000
        )
      ),
    ]);

    // Create context with optimized settings
    context = await browser.newContext({
      viewport: BROWSERLESS_CONFIG.viewport,
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      // Disable unnecessary features
      javaScriptEnabled: true,
      ignoreHTTPSErrors: true,
    });

    page = await context.newPage();

    // Block unnecessary resources for faster loading
    if (blockResources) {
      await page.route('**/*', route => {
        const request = route.request();
        const resourceType = request.resourceType();
        const url = request.url();

        // Block heavy resource types
        if (BLOCKED_RESOURCE_TYPES.has(resourceType)) {
          return route.abort();
        }

        // Block tracking/analytics URLs
        for (const pattern of BLOCKED_URL_PATTERNS) {
          const regex = new RegExp(
            pattern.replace(/\*/g, '.*').replace(/\./g, '\\.'),
            'i'
          );
          if (regex.test(url)) {
            return route.abort();
          }
        }

        return route.continue();
      });
    }

    // Navigate with timeout
    const response = await page.goto(url, {
      timeout: pageLoadTimeout,
      waitUntil: 'domcontentloaded', // Faster than 'networkidle'
    });

    if (!response) {
      throw new BrowserlessError('Failed to load page', 'PAGE_ERROR');
    }

    // Optionally wait for a specific selector
    if (waitForSelector) {
      await page.waitForSelector(waitForSelector, {
        timeout: Math.min(5000, operationTimeout - (Date.now() - startTime)),
      });
    }

    // Small delay for any critical JS to execute
    await page.waitForTimeout(500);

    // Extract HTML immediately
    const html = await page.content();
    const finalUrl = page.url();

    const durationMs = Date.now() - startTime;

    logger.info('Browserless fetch completed', {
      url,
      finalUrl,
      durationMs,
      htmlLength: html.length,
    });

    return { html, finalUrl, durationMs };
  } catch (error) {
    const durationMs = Date.now() - startTime;

    logger.error('Browserless fetch failed', {
      url,
      durationMs,
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof BrowserlessError) {
      throw error;
    }

    if (error instanceof Error && error.message.includes('timeout')) {
      throw new BrowserlessError(
        `Page load timeout after ${durationMs}ms`,
        'TIMEOUT'
      );
    }

    throw new BrowserlessError(
      `Failed to fetch page: ${error instanceof Error ? error.message : String(error)}`,
      'PAGE_ERROR'
    );
  } finally {
    // Clean up resources immediately to minimize billing
    try {
      if (page) await page.close().catch(() => {});
      if (context) await context.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Check if a fetch error indicates we should try Browserless.
 * Returns true for 403, 429, or bot detection errors.
 */
export function shouldFallbackToBrowserless(error: unknown): boolean {
  if (!isBrowserlessConfigured()) {
    return false;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Common bot detection indicators
    if (
      message.includes('403') ||
      message.includes('429') ||
      message.includes('forbidden') ||
      message.includes('blocked') ||
      message.includes('captcha') ||
      message.includes('cloudflare') ||
      message.includes('bot')
    ) {
      return true;
    }
  }

  return false;
}
