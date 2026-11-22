/**
 * Network capture for design reference intake (JOV-7081): a direct image
 * fetch, else a 1440x900 Playwright fold. Capture policy (robots.txt, no-
 * scrape hosts) is checked first; a bot wall is treated as a refusal.
 */

import { setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net';
import { basename } from 'node:path';
import sharp from 'sharp';

import {
  checkCapturePermission,
  DESIGN_REFS_USER_AGENT,
} from '@/lib/agent-os/design-reference-corpus/capture-policy';
import type { DesignReferenceMedia } from '@/lib/agent-os/design-reference-corpus/types';

export const FOLD = { width: 1440, height: 900 } as const;
export const FOLD_MOBILE = { width: 390, height: 844 } as const;

export interface CaptureViewport {
  readonly width: number;
  readonly height: number;
}

// Node's 250ms happy-eyeballs window drops IPv4 on a loaded machine with no
// IPv6 route, so robots.txt fetches failed closed.
setDefaultAutoSelectFamilyAttemptTimeout(2_000);

export interface Captured {
  readonly jpeg: Buffer;
  readonly via: DesignReferenceMedia['capturedVia'];
  readonly title: string;
}

export type CaptureUrl = (
  url: URL,
  viewport?: CaptureViewport
) => Promise<Captured>;

export const BOT_CHALLENGE =
  /just a moment|verify you are human|performing security verification|checking your browser|access denied/iu;

const CONSENT_HIDE_CSS = `${[
  '#onetrust-consent-sdk',
  '#CybotCookiebotDialog',
  '#usercentrics-root',
  '[id*="cookie" i][role="dialog"]',
  '[class*="cookie" i][class*="banner" i]',
  '[aria-label*="cookie" i]',
  '[id*="consent" i]',
].join(',')}{display:none!important}`;

export function toFoldJpeg(
  input: Buffer,
  viewport: CaptureViewport = FOLD
): Promise<Buffer> {
  return sharp(input)
    .resize({ width: viewport.width, withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
}

async function captureFold(
  url: URL,
  viewport: CaptureViewport = FOLD
): Promise<Captured> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      colorScheme: 'dark',
      reducedMotion: 'reduce',
      userAgent: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 ${DESIGN_REFS_USER_AGENT}/1.0`,
    });
    const page = await context.newPage();
    await page
      .goto(url.href, { waitUntil: 'networkidle', timeout: 30_000 })
      .catch(() => page.waitForLoadState('load', { timeout: 15_000 }));
    await page.waitForTimeout(1500);
    const title = (await page.title()).trim() || url.hostname;
    const text = await page.evaluate(() => document.body?.innerText ?? '');
    if (BOT_CHALLENGE.test(`${title}\n${text.slice(0, 2000)}`)) {
      throw new Error(
        `capture refused: ${url.hostname} served a bot challenge`
      );
    }
    // Hide consent overlays rather than answering them on the site's behalf.
    await page.addStyleTag({ content: CONSENT_HIDE_CSS });
    const png = await page.screenshot({ type: 'png' });
    return { jpeg: await toFoldJpeg(png, viewport), via: 'playwright', title };
  } finally {
    await browser.close();
  }
}

export function createUrlCapture(
  fetcher: typeof fetch = fetch,
  fold: (
    url: URL,
    viewport?: CaptureViewport
  ) => Promise<Captured> = captureFold
): CaptureUrl {
  return async (url, viewport = FOLD) => {
    const permission = await checkCapturePermission(url, fetcher);
    if (!permission.allowed) {
      throw new Error(`capture refused: ${permission.reason}`);
    }
    const init = {
      headers: { 'user-agent': DESIGN_REFS_USER_AGENT },
      signal: AbortSignal.timeout(30_000),
    };
    const head = await fetcher(url, { ...init, method: 'HEAD' }).catch(
      () => null
    );
    if (!head?.headers.get('content-type')?.startsWith('image/')) {
      return fold(url, viewport);
    }
    const response = await fetcher(url, init);
    return {
      jpeg: await toFoldJpeg(
        Buffer.from(await response.arrayBuffer()),
        viewport
      ),
      via: 'image-fetch',
      title: basename(url.pathname),
    };
  };
}
