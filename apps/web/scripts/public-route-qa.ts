import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';
import {
  assertPublicSurfaceHealthy,
  createPublicMonitoring,
  installPublicRouteMocks,
  waitForPublicSurfaceReady,
} from '@/tests/e2e/utils/public-surface-helpers';
import {
  type ResolvedPublicSurfaceSpec,
  resolvePublicSurfaceManifest,
} from '@/tests/e2e/utils/public-surface-manifest';

type PublicQaStatus = 'pass' | 'fail';

export interface PublicQaResult {
  readonly id: string;
  readonly family: ResolvedPublicSurfaceSpec['family'];
  readonly status: PublicQaStatus;
  readonly resolvedPath: string;
  readonly finalUrl: string;
  readonly title: string;
  readonly sameOriginFailures: readonly string[];
  readonly consoleErrors: readonly string[];
  readonly pageErrors: readonly string[];
  readonly screenshotPath?: string;
  readonly errorMessage?: string;
}

const BASE_URL = process.env.BASE_URL?.trim() || 'http://127.0.0.1:3100';
const OUTPUT_SEGMENT =
  process.env.PUBLIC_ROUTE_QA_OUTPUT_DIR?.trim() || 'latest';
const FILTER = process.env.PUBLIC_ROUTE_QA_FILTER?.trim() || '';
const OUTPUT_ROOT = path.resolve(
  process.cwd(),
  'test-results',
  'public-route-qa',
  OUTPUT_SEGMENT
);
const SCREENSHOT_DIR = path.join(OUTPUT_ROOT, 'screenshots');

try {
  new URL(BASE_URL);
} catch {
  console.error(`Invalid BASE_URL: ${BASE_URL}`);
  process.exit(1);
}

function buildAbsoluteUrl(baseUrl: string, resolvedPath: string) {
  return new URL(resolvedPath, baseUrl).toString();
}

function toSlug(value: string) {
  return value.replaceAll(/[^a-zA-Z0-9_-]/g, '-');
}

function collectSameOriginFailures(
  baseUrl: string,
  failures: readonly { url: string; status: number; statusText: string }[],
  surface: ResolvedPublicSurfaceSpec,
  currentUrl: string
) {
  const origin = new URL(baseUrl).origin;
  const currentPath = new URL(currentUrl).pathname;
  return failures
    .filter(failure => {
      if (!failure.url.startsWith(origin)) {
        return false;
      }

      const failurePath = new URL(failure.url).pathname;
      if (
        surface.expectedState === 'not-found' &&
        failure.status === 404 &&
        failurePath === currentPath
      ) {
        return false;
      }

      if (
        surface.allowedFinalDocumentStatuses?.includes(failure.status) &&
        failurePath === currentPath
      ) {
        return false;
      }

      return true;
    })
    .map(
      failure =>
        `${failure.status} ${failure.statusText} ${new URL(failure.url).pathname}`
    );
}

function collectCriticalConsoleErrors(
  surface: ResolvedPublicSurfaceSpec,
  consoleErrors: readonly string[]
) {
  return consoleErrors.filter(error => {
    const normalized = error.toLowerCase();
    const isExpectedClerkFetchNoise =
      normalized.includes('typeerror: failed to fetch') &&
      normalized.includes('clerk.browser.js');

    if (isExpectedClerkFetchNoise) {
      return false;
    }

    if (
      surface.allowedFinalDocumentStatuses?.includes(404) &&
      normalized.includes('failed to load resource') &&
      normalized.includes('404')
    ) {
      return false;
    }

    return true;
  });
}

function collectExpectedPageErrors(
  surface: ResolvedPublicSurfaceSpec,
  pageErrors: readonly string[]
) {
  return pageErrors.filter(error => {
    const normalized = error.toLowerCase();
    const isExpectedNotFoundBoundaryNoise =
      (surface.expectedState === 'not-found' ||
        surface.allowedFinalDocumentStatuses?.includes(404)) &&
      normalized.includes('minified react error #419');

    return !isExpectedNotFoundBoundaryNoise;
  });
}

async function runSurfaceCheck(
  page: import('@playwright/test').Page,
  surface: ResolvedPublicSurfaceSpec
): Promise<PublicQaResult> {
  const monitoring = createPublicMonitoring(page);
  let screenshotPath: string | undefined;

  try {
    await page.goto(buildAbsoluteUrl(BASE_URL, surface.resolvedPath), {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });
    await waitForPublicSurfaceReady(page, surface);
    await assertPublicSurfaceHealthy(page, surface);

    const diagnostics = monitoring.getContext();
    const sameOriginFailures = collectSameOriginFailures(
      BASE_URL,
      diagnostics.networkDiagnostics.failedResponses,
      surface,
      page.url()
    );

    if (sameOriginFailures.length > 0) {
      throw new Error(
        `Same-origin failures detected: ${sameOriginFailures.join('; ')}`
      );
    }

    const criticalConsoleErrors = collectCriticalConsoleErrors(
      surface,
      diagnostics.criticalErrors
    );

    if (criticalConsoleErrors.length > 0) {
      throw new Error(
        `Critical console errors detected: ${criticalConsoleErrors.join('; ')}`
      );
    }

    const pageErrors = collectExpectedPageErrors(
      surface,
      diagnostics.uncaughtExceptions
    );

    if (pageErrors.length > 0) {
      throw new Error(
        `Uncaught page errors detected: ${pageErrors.join('; ')}`
      );
    }

    return {
      id: surface.id,
      family: surface.family,
      status: 'pass',
      resolvedPath: surface.resolvedPath,
      finalUrl: page.url(),
      title: await page.title(),
      sameOriginFailures,
      consoleErrors: criticalConsoleErrors,
      pageErrors,
    };
  } catch (error) {
    await mkdir(SCREENSHOT_DIR, { recursive: true });
    screenshotPath = path.join(SCREENSHOT_DIR, `${toSlug(surface.id)}.png`);
    await page
      .screenshot({
        path: screenshotPath,
        fullPage: true,
      })
      .catch(() => undefined);

    const diagnostics = monitoring.getContext();

    return {
      id: surface.id,
      family: surface.family,
      status: 'fail',
      resolvedPath: surface.resolvedPath,
      finalUrl: page.url(),
      title: await page.title().catch(() => ''),
      sameOriginFailures: collectSameOriginFailures(
        BASE_URL,
        diagnostics.networkDiagnostics.failedResponses,
        surface,
        page.url()
      ),
      consoleErrors: collectCriticalConsoleErrors(
        surface,
        diagnostics.criticalErrors
      ),
      pageErrors: collectExpectedPageErrors(
        surface,
        diagnostics.uncaughtExceptions
      ),
      screenshotPath,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  } finally {
    monitoring.cleanup();
  }
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL: BASE_URL,
    storageState: { cookies: [], origins: [] },
  });

  const filterTerms = FILTER.split(',')
    .map(term => term.trim())
    .filter(Boolean);
  const surfaces = (await resolvePublicSurfaceManifest()).filter(surface =>
    filterTerms.length === 0
      ? true
      : filterTerms.some(
          term =>
            surface.id.includes(term) ||
            surface.resolvedPath.includes(term) ||
            surface.family.includes(term)
        )
  );
  const results: PublicQaResult[] = [];

  for (const surface of surfaces) {
    console.log(
      `[public-route-qa] checking ${surface.id} ${surface.resolvedPath}`
    );
    const page = await context.newPage();
    await installPublicRouteMocks(page);
    const result = await runSurfaceCheck(page, surface);
    console.log(
      `[public-route-qa] ${result.status.toUpperCase()} ${surface.id} -> ${
        result.finalUrl || surface.resolvedPath
      }${result.errorMessage ? ` | ${result.errorMessage}` : ''}`
    );
    results.push(result);
    await page.close();
  }

  await mkdir(OUTPUT_ROOT, { recursive: true });
  const summary = {
    baseUrl: BASE_URL,
    checkedAt: new Date().toISOString(),
    totals: {
      total: results.length,
      failed: results.filter(result => result.status === 'fail').length,
      passed: results.filter(result => result.status === 'pass').length,
    },
    results,
  };

  await writeFile(
    path.join(OUTPUT_ROOT, 'summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`
  );

  await context.close();
  await browser.close();

  const failed = results.filter(result => result.status === 'fail');
  if (failed.length > 0) {
    throw new Error(
      `Public route QA failed for: ${failed.map(result => result.id).join(', ')}`
    );
  }
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
