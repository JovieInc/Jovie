import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium, type Page } from 'playwright';
import sharp from 'sharp';
import {
  PROFILE_MOCK_HOME_APPROVAL_CAPTURES,
  type ProfileMockCropRect,
} from '../lib/profile/mock-home-diff-manifest';

interface CliOptions {
  readonly baseUrl: string;
  readonly cycle: string;
  readonly targetPath: string;
}

interface DiffSummaryEntry {
  readonly id: string;
  readonly label: string;
  readonly threshold: number;
  readonly diffRatio: number;
  readonly passed: boolean;
}

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

const SCREENSHOT_VIEWPORT = {
  width: 1440,
  height: 2200,
} as const;

const PIXEL_DIFF_THRESHOLD = 34;

function parseArgs(argv: readonly string[]): CliOptions {
  const webRoot = process.cwd().endsWith('/apps/web')
    ? process.cwd()
    : path.resolve(process.cwd(), 'apps/web');
  const repoRoot = path.resolve(webRoot, '..', '..');
  const options = {
    baseUrl: process.env.BASE_URL ?? 'http://localhost:3002',
    cycle: process.env.PROFILE_MOCK_DIFF_CYCLE ?? 'latest',
    targetPath: path.resolve(repoRoot, '.context/attachments/image-v5.png'),
  };

  for (const arg of argv) {
    if (arg.startsWith('--base-url=')) {
      options.baseUrl = arg.slice('--base-url='.length);
    } else if (arg.startsWith('--cycle=')) {
      options.cycle = arg.slice('--cycle='.length);
    } else if (arg.startsWith('--target=')) {
      options.targetPath = path.resolve(arg.slice('--target='.length));
    }
  }

  return options;
}

function resolveOutputPaths(cycle: string) {
  const webRoot = process.cwd().endsWith('/apps/web')
    ? process.cwd()
    : path.resolve(process.cwd(), 'apps/web');
  const repoRoot = path.resolve(webRoot, '..', '..');
  const cycleRoot = path.resolve(
    repoRoot,
    `.context/profile-mock-diff/${cycle}`
  );

  return {
    cycleRoot,
    approvalRoot: path.join(cycleRoot, 'approval'),
    targetRoot: path.join(cycleRoot, 'targets'),
    summaryPath: path.join(cycleRoot, 'summary.json'),
    targetCopyPath: path.join(cycleRoot, 'target.png'),
  };
}

function toExtractRect(
  rect: ProfileMockCropRect,
  width: number,
  height: number
): sharp.Region {
  const left = Math.round(rect.x * width);
  const top = Math.round(rect.y * height);
  const extractWidth = Math.max(1, Math.round(rect.width * width));
  const extractHeight = Math.max(1, Math.round(rect.height * height));

  return {
    left,
    top,
    width: Math.min(extractWidth, width - left),
    height: Math.min(extractHeight, height - top),
  };
}

async function hideTransientUi(page: Page) {
  await page.evaluate((selectors: readonly string[]) => {
    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach(element => {
        (element as HTMLElement).style.display = 'none';
      });
    }
  }, DEV_OVERLAY_SELECTORS);
}

async function waitForImages(page: Page, selector = 'body') {
  await page.waitForFunction(
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
  );
}

async function captureLocatorScreenshot(params: {
  readonly page: Page;
  readonly route: string;
  readonly selector: string;
  readonly outputPath: string;
}) {
  const { page, route, selector, outputPath } = params;

  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await page.locator(selector).waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await hideTransientUi(page);
  await waitForImages(page);
  await page.locator(selector).screenshot({ path: outputPath });
}

async function buildHeatmap(params: {
  readonly currentCrop: Buffer;
  readonly targetCrop: Buffer;
}) {
  const [currentRaw, targetRaw] = await Promise.all([
    sharp(params.currentCrop)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }),
    sharp(params.targetCrop)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }),
  ]);

  if (
    currentRaw.info.width !== targetRaw.info.width ||
    currentRaw.info.height !== targetRaw.info.height
  ) {
    throw new Error('Current and target crops must have identical dimensions.');
  }

  let diffPixels = 0;
  const overlay = Buffer.alloc(currentRaw.data.length, 0);

  for (let index = 0; index < currentRaw.data.length; index += 4) {
    const redDiff = Math.abs(currentRaw.data[index] - targetRaw.data[index]);
    const greenDiff = Math.abs(
      currentRaw.data[index + 1] - targetRaw.data[index + 1]
    );
    const blueDiff = Math.abs(
      currentRaw.data[index + 2] - targetRaw.data[index + 2]
    );
    const alphaDiff = Math.abs(
      currentRaw.data[index + 3] - targetRaw.data[index + 3]
    );
    const delta = Math.max(redDiff, greenDiff, blueDiff, alphaDiff);

    if (delta >= PIXEL_DIFF_THRESHOLD) {
      diffPixels += 1;
      overlay[index] = 255;
      overlay[index + 1] = 143;
      overlay[index + 2] = 61;
      overlay[index + 3] = 224;
    }
  }

  const heatmap = await sharp(params.currentCrop)
    .ensureAlpha()
    .composite([
      {
        input: await sharp(overlay, {
          raw: {
            width: currentRaw.info.width,
            height: currentRaw.info.height,
            channels: 4,
          },
        })
          .png()
          .toBuffer(),
      },
    ])
    .png()
    .toBuffer();

  const diffRatio =
    diffPixels / (currentRaw.info.width * currentRaw.info.height);

  return { diffRatio, heatmap };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const outputPaths = resolveOutputPaths(options.cycle);

  await Promise.all([
    mkdir(outputPaths.cycleRoot, { recursive: true }),
    mkdir(outputPaths.approvalRoot, { recursive: true }),
    mkdir(outputPaths.targetRoot, { recursive: true }),
  ]);
  await copyFile(options.targetPath, outputPaths.targetCopyPath);

  const targetImage = sharp(options.targetPath);
  const targetMetadata = await targetImage.metadata();
  const targetWidth = targetMetadata.width ?? 0;
  const targetHeight = targetMetadata.height ?? 0;

  if (targetWidth === 0 || targetHeight === 0) {
    throw new Error('Target mock dimensions could not be resolved.');
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: SCREENSHOT_VIEWPORT,
    deviceScaleFactor: 1,
  });

  await page.route('**/api/px', route =>
    route.fulfill({ status: 204, body: '' })
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });

  const summary: DiffSummaryEntry[] = [];

  try {
    for (const approvalCapture of PROFILE_MOCK_HOME_APPROVAL_CAPTURES) {
      const rawCapturePath = path.join(
        outputPaths.approvalRoot,
        `${approvalCapture.id}-raw.png`
      );
      const currentCropPath = path.join(
        outputPaths.approvalRoot,
        `${approvalCapture.id}-current.png`
      );
      const targetCropPath = path.join(
        outputPaths.targetRoot,
        `${approvalCapture.id}-target.png`
      );
      const heatmapPath = path.join(
        outputPaths.approvalRoot,
        `${approvalCapture.id}-heatmap.png`
      );

      await captureLocatorScreenshot({
        page,
        route: `${options.baseUrl}${approvalCapture.route}`,
        selector: approvalCapture.selector,
        outputPath: rawCapturePath,
      });

      const targetCrop = await sharp(options.targetPath)
        .extract(
          toExtractRect(approvalCapture.targetRect, targetWidth, targetHeight)
        )
        .png()
        .toBuffer();
      const targetCropMetadata = await sharp(targetCrop).metadata();
      const captureWidth = targetCropMetadata.width ?? 0;
      const captureHeight = targetCropMetadata.height ?? 0;

      if (captureWidth === 0 || captureHeight === 0) {
        throw new Error(
          `Target crop dimensions could not be resolved for ${approvalCapture.id}.`
        );
      }

      const rawCaptureMetadata = await sharp(rawCapturePath).metadata();
      const rawCaptureWidth = rawCaptureMetadata.width ?? 0;
      const rawCaptureHeight = rawCaptureMetadata.height ?? 0;

      const currentCrop = await sharp(rawCapturePath)
        .extract(
          toExtractRect(
            approvalCapture.currentRect,
            rawCaptureWidth,
            rawCaptureHeight
          )
        )
        .resize({
          width: captureWidth,
          height: captureHeight,
          fit: 'fill',
        })
        .png()
        .toBuffer();

      await Promise.all([
        writeFile(currentCropPath, currentCrop),
        writeFile(targetCropPath, targetCrop),
      ]);

      const { diffRatio, heatmap } = await buildHeatmap({
        currentCrop,
        targetCrop,
      });
      await writeFile(heatmapPath, heatmap);

      summary.push({
        id: approvalCapture.id,
        label: approvalCapture.label,
        threshold: approvalCapture.threshold,
        diffRatio,
        passed: diffRatio <= approvalCapture.threshold,
      });
    }

    await writeFile(
      outputPaths.summaryPath,
      JSON.stringify(
        {
          baseUrl: options.baseUrl,
          cycle: options.cycle,
          targetPath: options.targetPath,
          summary,
          passed: summary.every(entry => entry.passed),
        },
        null,
        2
      )
    );

    if (summary.some(entry => !entry.passed)) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
