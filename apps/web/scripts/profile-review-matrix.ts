import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium, type Locator, type Page, type Route } from 'playwright';

type BreakpointName = 'mobile' | 'tablet' | 'desktop';

interface BreakpointConfig {
  readonly name: BreakpointName;
  readonly width: number;
  readonly height: number;
}

interface CaptureCase {
  readonly id: string;
  readonly route: string;
  readonly selector: string;
  readonly beforeNavigate?: (page: Page) => Promise<void>;
  readonly prepare?: (page: Page) => Promise<void>;
}

interface CliOptions {
  readonly baseUrl: string;
  readonly cycle: string;
  readonly only: readonly string[];
}

const BREAKPOINTS: readonly BreakpointConfig[] = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 900 },
] as const;

const DEV_OVERLAY_SELECTORS = [
  '[data-sonner-toaster]',
  '[data-testid="cookie-banner"], [data-cookie-banner]',
  '[role="tooltip"]',
  '#intercom-container, .intercom-lightweight-app',
  '[data-testid="dev-toolbar"]',
  '.tsqd-parent-container',
  'button[aria-label*="query devtools" i]',
  '#vercel-toolbar',
  '[data-nextjs-dialog-overlay]',
  '[data-nextjs-toast]',
  'nextjs-portal',
  '[data-nextjs-build-indicator]',
] as const;

const SCREENSHOT_CASES: readonly CaptureCase[] = [
  {
    id: 'home',
    route: '/dualipa',
    selector: '[data-testid="profile-compact-shell"]',
  },
  {
    id: 'music',
    route: '/dualipa?mode=listen',
    selector: '[data-testid="profile-compact-shell"]',
  },
  {
    id: 'events',
    route: '/dualipa?mode=tour',
    selector: '[data-testid="profile-compact-shell"]',
  },
  {
    id: 'profile',
    route: '/dualipa?mode=about',
    selector: '[data-testid="profile-compact-shell"]',
  },
  {
    id: 'subscribe-intro',
    route: '/dualipa?mode=subscribe',
    selector: '[data-testid="profile-mobile-notifications-flow"]',
  },
  {
    id: 'subscribe-email',
    route: '/dualipa?mode=subscribe',
    selector: '[data-testid="profile-mobile-notifications-flow"]',
    prepare: async page => {
      await continueFromIntro(page);
      await waitForStep(page, 'email');
    },
  },
  {
    id: 'subscribe-otp',
    route: '/dualipa?mode=subscribe',
    selector: '[data-testid="profile-mobile-notifications-flow"]',
    prepare: async page => {
      await mockPendingConfirmation(page);
      await reachOtpStep(page);
    },
  },
  {
    id: 'subscribe-otp-error',
    route: '/dualipa?mode=subscribe',
    selector: '[data-testid="profile-mobile-notifications-flow"]',
    prepare: async page => {
      await mockPendingConfirmation(page);
      await page.route('**/api/notifications/verify-email-otp', route =>
        route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: 'Invalid verification code',
          }),
        })
      );
      await reachOtpStep(page);
      const firstDigitInput = page.getByLabel('Digit 1 of 6');
      await firstDigitInput.click();
      await firstDigitInput.pressSequentially('000000');
      await clickStepButton(page, 'otp', /^verify$/i);
      await getActiveStep(page, 'otp')
        .getByText(/invalid verification code/i)
        .waitFor({
          state: 'visible',
          timeout: 20_000,
        });
      await getActiveStep(page, 'otp').getByRole('alert').waitFor({
        state: 'visible',
        timeout: 20_000,
      });
    },
  },
  {
    id: 'subscribe-name',
    route: '/dualipa?mode=subscribe',
    selector: '[data-testid="profile-mobile-notifications-flow"]',
    prepare: async page => {
      await mockPendingConfirmation(page);
      await mockVerifiedFlow(page);
      await reachOtpStep(page);
      await enterOtpCode(page, '123456');
      await waitForStep(page, 'name');
    },
  },
  {
    id: 'subscribe-birthday',
    route: '/dualipa?mode=subscribe',
    selector: '[data-testid="profile-mobile-notifications-flow"]',
    prepare: async page => {
      await mockPendingConfirmation(page);
      await mockVerifiedFlow(page);
      await reachOtpStep(page);
      await enterOtpCode(page, '123456');
      await waitForStep(page, 'name');
      await clickStepButton(page, 'name', /^continue$/i);
      await waitForStep(page, 'birthday');
      await page.getByTestId('mobile-birthday-month').selectOption('04');
      await page.getByTestId('mobile-birthday-day').selectOption('05');
      await page.getByTestId('mobile-birthday-year').selectOption('1992');
    },
  },
  {
    id: 'alerts-manage',
    route: '/dualipa?mode=subscribe',
    selector: '[data-testid="profile-mobile-notifications-flow"]',
    beforeNavigate: async page => {
      await mockManageStatus(page);
    },
    prepare: async page => {
      await waitForStep(page, 'preferences');
    },
  },
  {
    id: 'subscribe-done',
    route: '/dualipa?mode=subscribe',
    selector: '[data-testid="profile-mobile-notifications-flow"]',
    prepare: async page => {
      await mockPendingConfirmation(page);
      await mockVerifiedFlow(page);
      await reachOtpStep(page);
      await enterOtpCode(page, '123456');
      await waitForStep(page, 'name');
      await page.getByTestId('mobile-name-input').fill('Alex');
      await clickStepButton(page, 'name', /^continue$/i);
      await waitForStep(page, 'birthday');
      await page.getByTestId('mobile-birthday-month').selectOption('04');
      await page.getByTestId('mobile-birthday-day').selectOption('24');
      await page.getByTestId('mobile-birthday-year').selectOption('1994');
      await clickStepButton(page, 'birthday', /^continue$/i);
      await waitForStep(page, 'preferences');
      await clickStepButton(page, 'preferences', /save & finish/i);
      await waitForStep(page, 'done');
    },
  },
  {
    id: 'notifications-page',
    route: '/testartist/notifications',
    selector: '[data-testid="profile-mobile-notifications-flow"]',
    prepare: async page => {
      await waitForStep(page, 'intro');
    },
  },
] as const;

function parseArgs(argv: readonly string[]): CliOptions {
  let baseUrl = process.env.BASE_URL ?? 'http://localhost:3002';
  let cycle =
    process.env.PROFILE_REVIEW_MATRIX_CYCLE ?? 'core-profile-review-pass';
  let only: string[] = [];

  for (const arg of argv) {
    if (arg.startsWith('--base-url=')) {
      baseUrl = arg.slice('--base-url='.length);
    } else if (arg.startsWith('--cycle=')) {
      cycle = arg.slice('--cycle='.length);
    } else if (arg.startsWith('--only=')) {
      only = arg
        .slice('--only='.length)
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
    }
  }

  return { baseUrl, cycle, only };
}

function getOutputPaths(cycle: string) {
  const webRoot = process.cwd().endsWith('/apps/web')
    ? process.cwd()
    : path.resolve(process.cwd(), 'apps/web');
  const repoRoot = path.resolve(webRoot, '..', '..');
  const cycleRoot = path.join(
    repoRoot,
    '.context/profile-review-matrix',
    cycle
  );

  return {
    cycleRoot,
    summaryPath: path.join(cycleRoot, 'summary.json'),
  };
}

async function blockAnalytics(page: Page) {
  await page.route('**/api/profile/view', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/audience/visit', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/track', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/px', route =>
    route.fulfill({ status: 204, body: '' })
  );
}

async function mockPendingConfirmation(page: Page) {
  await page.route('**/api/notifications/subscribe', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, pendingConfirmation: true }),
    })
  );
}

async function mockVerifiedFlow(page: Page) {
  const okJson = { status: 200, contentType: 'application/json' } as const;

  await page.route('**/api/notifications/verify-email-otp', route =>
    route.fulfill({
      ...okJson,
      body: JSON.stringify({ success: true }),
    })
  );
  await page.route('**/api/notifications/update-name', route =>
    route.fulfill({
      ...okJson,
      body: JSON.stringify({ success: true }),
    })
  );
  await page.route('**/api/notifications/update-birthday', route =>
    route.fulfill({
      ...okJson,
      body: JSON.stringify({ success: true }),
    })
  );
  await page.route('**/api/notifications/preferences', route =>
    route.fulfill({
      ...okJson,
      body: JSON.stringify({ success: true }),
    })
  );
}

async function mockManageStatus(page: Page) {
  await page.addInitScript(() => {
    globalThis.localStorage.setItem(
      'jovie:notification-contacts',
      JSON.stringify({ email: 'fan@example.com' })
    );
  });
  await page.route('**/api/notifications/status**', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        channels: { email: true, sms: false },
        details: { email: 'fan@example.com' },
        contentPreferences: {
          newMusic: true,
          tourDates: true,
          merch: true,
          general: true,
        },
        artistEmail: {
          optedIn: false,
          pendingProvider: false,
          visibleToArtist: false,
        },
      }),
    })
  );
}

async function hideTransientUi(page: Page) {
  await page.evaluate((selectors: readonly string[]) => {
    const styleId = 'profile-review-hide-transient';
    const selectorText = selectors.join(', ');
    let style = document.getElementById(styleId) as HTMLStyleElement | null;

    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      style.textContent = `${selectorText} { display: none !important; visibility: hidden !important; opacity: 0 !important; }`;
      document.head.appendChild(style);
    }

    document.querySelectorAll(selectorText).forEach(element => {
      (element as HTMLElement).style.display = 'none';
      (element as HTMLElement).style.visibility = 'hidden';
      (element as HTMLElement).style.opacity = '0';
    });
  }, DEV_OVERLAY_SELECTORS);
}

async function waitForImages(page: Page, selector = 'body') {
  await page
    .waitForFunction(
      (targetSelector: string) => {
        const container =
          targetSelector === 'body'
            ? document.body
            : document.querySelector(targetSelector);

        if (!container) {
          return false;
        }

        const images = Array.from(container.querySelectorAll('img'));
        return images.every(
          image =>
            image.complete &&
            typeof image.naturalWidth === 'number' &&
            image.naturalWidth > 0
        );
      },
      selector,
      { timeout: 20_000 }
    )
    .catch(() => undefined);
}

async function waitForHydration(page: Page) {
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  await page.waitForTimeout(1_800);
}

function getActiveFlow(page: Page): Locator {
  return page.getByTestId('profile-mobile-notifications-flow').last();
}

function getActiveStep(
  page: Page,
  step: 'intro' | 'email' | 'otp' | 'name' | 'birthday' | 'preferences' | 'done'
): Locator {
  return getActiveFlow(page).getByTestId(
    `profile-mobile-notifications-step-${step}`
  );
}

function getCaptureLocator(page: Page, selector: string): Locator {
  if (selector === '[data-testid="profile-mobile-notifications-flow"]') {
    return getActiveFlow(page);
  }

  return page.locator(selector);
}

async function waitForStep(
  page: Page,
  step: 'intro' | 'email' | 'otp' | 'name' | 'birthday' | 'preferences' | 'done'
) {
  await getActiveStep(page, step).waitFor({
    state: 'visible',
    timeout: 20_000,
  });
}

async function clickStepButton(
  page: Page,
  step:
    | 'intro'
    | 'email'
    | 'otp'
    | 'name'
    | 'birthday'
    | 'preferences'
    | 'done',
  name: RegExp
) {
  await getActiveStep(page, step).getByRole('button', { name }).click({
    force: true,
  });
}

async function continueFromIntro(page: Page) {
  await waitForStep(page, 'intro');
  await clickStepButton(page, 'intro', /^continue$/i);
}

async function reachOtpStep(page: Page) {
  await continueFromIntro(page);
  await waitForStep(page, 'email');
  await page.getByTestId('mobile-email-input').fill('fan@example.com');
  await clickStepButton(page, 'email', /^continue$/i);
  await waitForStep(page, 'otp');
}

async function enterOtpCode(page: Page, code: string) {
  const firstDigitInput = page.getByLabel('Digit 1 of 6');

  await firstDigitInput.waitFor({ state: 'visible', timeout: 20_000 });
  await firstDigitInput.click();
  await firstDigitInput.pressSequentially(code);

  const otpSubmitBtn = page
    .getByTestId('profile-mobile-notifications-flow')
    .last()
    .getByTestId('profile-mobile-notifications-step-otp')
    .getByRole('button', { name: /^verify$/i });
  const canClickVerify = await otpSubmitBtn
    .isEnabled({ timeout: 800 })
    .catch(() => false);

  if (canClickVerify) {
    await clickStepButton(page, 'otp', /^verify$/i);
  }
}

async function captureReviewCase(params: {
  readonly page: Page;
  readonly baseUrl: string;
  readonly breakpoint: BreakpointConfig;
  readonly captureCase: CaptureCase;
  readonly outputDir: string;
}) {
  const { page, baseUrl, breakpoint, captureCase, outputDir } = params;

  await page.setViewportSize({
    width: breakpoint.width,
    height: breakpoint.height,
  });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await blockAnalytics(page);
  if (captureCase.beforeNavigate) {
    await captureCase.beforeNavigate(page);
  }
  await page.goto(`${baseUrl}${captureCase.route}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
  await waitForHydration(page);
  if (captureCase.prepare) {
    await captureCase.prepare(page);
  }
  const captureLocator = getCaptureLocator(page, captureCase.selector);
  await captureLocator.waitFor({
    state: 'visible',
    timeout: 20_000,
  });
  await waitForImages(page, captureCase.selector);
  await hideTransientUi(page);
  await page.waitForTimeout(500);

  const screenshotPath = path.join(
    outputDir,
    `${captureCase.id}-${breakpoint.name}.png`
  );
  await captureLocator.screenshot({
    path: screenshotPath,
  });

  return screenshotPath;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const outputPaths = getOutputPaths(options.cycle);
  await mkdir(outputPaths.cycleRoot, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const summary: Record<string, Record<BreakpointName, string>> = {};

  try {
    const activeCases =
      options.only.length > 0
        ? SCREENSHOT_CASES.filter(reviewCase =>
            options.only.includes(reviewCase.id)
          )
        : SCREENSHOT_CASES;

    for (const reviewCase of activeCases) {
      summary[reviewCase.id] = {
        mobile: '',
        tablet: '',
        desktop: '',
      };

      for (const breakpoint of BREAKPOINTS) {
        console.log(`capturing ${reviewCase.id} @ ${breakpoint.name}`);
        const page = await browser.newPage();
        try {
          const screenshotPath = await captureReviewCase({
            page,
            baseUrl: options.baseUrl,
            breakpoint,
            captureCase: reviewCase,
            outputDir: outputPaths.cycleRoot,
          });
          summary[reviewCase.id][breakpoint.name] = screenshotPath;
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
  }

  await writeFile(
    outputPaths.summaryPath,
    JSON.stringify(
      {
        cycle: options.cycle,
        baseUrl: options.baseUrl,
        generatedAt: new Date().toISOString(),
        screens: summary,
      },
      null,
      2
    )
  );
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
