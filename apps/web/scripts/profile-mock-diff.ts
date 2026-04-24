import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium, type Page } from 'playwright';
import sharp from 'sharp';
import {
  PROFILE_MOCK_HOME_APPROVAL_CAPTURES,
  PROFILE_MOCK_HOME_CAPTURE_SELECTOR,
  PROFILE_MOCK_HOME_DIFF_CROPS,
  PROFILE_MOCK_HOME_REVIEW_ROUTE,
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
    targetPath: path.resolve(repoRoot, '.context/attachments/image-v1.png'),
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
    currentRoot: path.join(cycleRoot, 'current'),
    cropRoot: path.join(cycleRoot, 'crops'),
    approvalRoot: path.join(cycleRoot, 'approval'),
    summaryPath: path.join(cycleRoot, 'summary.json'),
    targetCopyPath: path.join(cycleRoot, 'target.png'),
    currentCapturePath: path.join(cycleRoot, 'current', 'full-shell-raw.png'),
    currentResizedPath: path.join(cycleRoot, 'current', 'full-shell.png'),
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
  await page.waitForTimeout(2_500);
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
    mkdir(outputPaths.currentRoot, { recursive: true }),
    mkdir(outputPaths.cropRoot, { recursive: true }),
    mkdir(outputPaths.approvalRoot, { recursive: true }),
  ]);
  await copyFile(options.targetPath, outputPaths.targetCopyPath);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: SCREENSHOT_VIEWPORT,
    deviceScaleFactor: 1,
  });

  await page.route('**/api/px', route =>
    route.fulfill({ status: 204, body: '' })
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });

  try {
    await captureLocatorScreenshot({
      page,
      route: `${options.baseUrl}${PROFILE_MOCK_HOME_REVIEW_ROUTE}`,
      selector: PROFILE_MOCK_HOME_CAPTURE_SELECTOR,
      outputPath: outputPaths.currentCapturePath,
    });

    const targetImage = sharp(options.targetPath);
    const targetMetadata = await targetImage.metadata();
    const targetWidth = targetMetadata.width ?? 0;
    const targetHeight = targetMetadata.height ?? 0;

    if (targetWidth === 0 || targetHeight === 0) {
      throw new Error('Target mock dimensions could not be resolved.');
    }

    const currentResized = await sharp(outputPaths.currentCapturePath)
      .resize({
        width: targetWidth,
        height: targetHeight,
        fit: 'fill',
      })
      .png()
      .toBuffer();
    await writeFile(outputPaths.currentResizedPath, currentResized);

    const summary: DiffSummaryEntry[] = [];

    for (const crop of PROFILE_MOCK_HOME_DIFF_CROPS) {
      const extractRect = toExtractRect(crop.rect, targetWidth, targetHeight);
      const targetCrop = await sharp(options.targetPath)
        .extract(extractRect)
        .png()
        .toBuffer();
      const currentCrop = await sharp(currentResized)
        .extract(extractRect)
        .png()
        .toBuffer();

      const targetCropPath = path.join(
        outputPaths.cropRoot,
        `${crop.id}-target.png`
      );
      const currentCropPath = path.join(
        outputPaths.cropRoot,
        `${crop.id}-current.png`
      );
      const heatmapPath = path.join(
        outputPaths.cropRoot,
        `${crop.id}-heatmap.png`
      );

      await Promise.all([
        writeFile(targetCropPath, targetCrop),
        writeFile(currentCropPath, currentCrop),
      ]);

      const { diffRatio, heatmap } = await buildHeatmap({
        currentCrop,
        targetCrop,
      });
      await writeFile(heatmapPath, heatmap);

      summary.push({
        id: crop.id,
        label: crop.label,
        threshold: crop.threshold,
        diffRatio,
        passed: diffRatio <= crop.threshold,
      });
    }

    for (const approvalCapture of PROFILE_MOCK_HOME_APPROVAL_CAPTURES) {
      await captureLocatorScreenshot({
        page,
        route: `${options.baseUrl}${approvalCapture.route}`,
        selector: approvalCapture.selector,
        outputPath: path.join(
          outputPaths.approvalRoot,
          `${approvalCapture.id}.png`
        ),
      });
    }

    await writeFile(
      outputPaths.summaryPath,
      JSON.stringify(
        {
          baseUrl: options.baseUrl,
          cycle: options.cycle,
          targetPath: options.targetPath,
          thresholds: PROFILE_MOCK_HOME_DIFF_CROPS.map(crop => ({
            id: crop.id,
            threshold: crop.threshold,
          })),
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
