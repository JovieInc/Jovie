import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { CaptureTarget } from './capture-target';

const execFileAsync = promisify(execFile);

const CLOUDFLARE_SCREENSHOT_URL =
  'https://api.cloudflare.com/client/v4/accounts';

export interface ScreenshotCaptureResult {
  readonly ok: boolean;
  readonly outputPath: string;
  readonly publicPath: string;
  readonly error?: string;
}

function resolveAccountId(): string | null {
  return (
    process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ||
    process.env.R2_ACCOUNT_ID?.trim() ||
    null
  );
}

function isPng(buffer: Buffer): boolean {
  return (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  );
}

export async function captureWebScreenshot(params: {
  readonly url: string;
  readonly outputPath: string;
  readonly apiToken?: string;
  readonly accountId?: string;
}): Promise<ScreenshotCaptureResult> {
  const publicPath = path.basename(params.outputPath);
  const token = params.apiToken ?? process.env.CLOUDFLARE_API_TOKEN;
  const accountId = params.accountId ?? resolveAccountId();

  if (!token || !accountId) {
    return {
      ok: false,
      outputPath: params.outputPath,
      publicPath,
      error: 'CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID not configured',
    };
  }

  const endpoint = `${CLOUDFLARE_SCREENSHOT_URL}/${accountId}/browser-rendering/screenshot`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: params.url,
        viewport: { width: 1280, height: 720 },
        gotoOptions: { waitUntil: 'networkidle0', timeout: 45_000 },
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return {
        ok: false,
        outputPath: params.outputPath,
        publicPath,
        error: `Cloudflare screenshot failed (${response.status}): ${body.slice(0, 200)}`,
      };
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (!isPng(bytes)) {
      return {
        ok: false,
        outputPath: params.outputPath,
        publicPath,
        error: 'Cloudflare screenshot response was not a PNG',
      };
    }

    await mkdir(path.dirname(params.outputPath), { recursive: true });
    await writeFile(params.outputPath, bytes);

    return { ok: true, outputPath: params.outputPath, publicPath };
  } catch (error) {
    return {
      ok: false,
      outputPath: params.outputPath,
      publicPath,
      error:
        error instanceof Error ? error.message : 'Screenshot capture failed',
    };
  }
}

async function readExistingIosScreenshot(
  scenario: string,
  repoRoot: string
): Promise<Buffer | null> {
  const candidate = path.join(
    repoRoot,
    'artifacts/ios-screenshots',
    `${scenario}.png`
  );

  try {
    const bytes = await readFile(candidate);
    return isPng(bytes) ? bytes : null;
  } catch {
    return null;
  }
}

export async function captureIosScreenshot(params: {
  readonly scenario: string;
  readonly outputPath: string;
  readonly repoRoot: string;
}): Promise<ScreenshotCaptureResult> {
  const publicPath = path.basename(params.outputPath);

  const existing = await readExistingIosScreenshot(
    params.scenario,
    params.repoRoot
  );
  if (existing) {
    await mkdir(path.dirname(params.outputPath), { recursive: true });
    await writeFile(params.outputPath, existing);
    return { ok: true, outputPath: params.outputPath, publicPath };
  }

  const scriptPath = path.join(
    params.repoRoot,
    'apps/ios/scripts/capture-screenshots.sh'
  );

  try {
    await execFileAsync('bash', [scriptPath], {
      cwd: params.repoRoot,
      env: {
        ...process.env,
        IOS_SCREENSHOT_DIR: path.join(
          params.repoRoot,
          'artifacts/ios-screenshots'
        ),
      },
      timeout: 600_000,
    });

    const captured = await readExistingIosScreenshot(
      params.scenario,
      params.repoRoot
    );
    if (!captured) {
      return {
        ok: false,
        outputPath: params.outputPath,
        publicPath,
        error: `iOS screenshot "${params.scenario}.png" not produced by capture script`,
      };
    }

    await mkdir(path.dirname(params.outputPath), { recursive: true });
    await writeFile(params.outputPath, captured);
    return { ok: true, outputPath: params.outputPath, publicPath };
  } catch (error) {
    return {
      ok: false,
      outputPath: params.outputPath,
      publicPath,
      error: error instanceof Error ? error.message : 'iOS screenshot failed',
    };
  }
}

export async function captureScreenshotForTarget(params: {
  readonly issueIdentifier: string;
  readonly target: CaptureTarget;
  readonly outputDir: string;
  readonly repoRoot: string;
}): Promise<ScreenshotCaptureResult> {
  const safeName = params.issueIdentifier.replace(/[^a-zA-Z0-9._-]/g, '_');
  const outputPath = path.join(params.outputDir, `${safeName}.png`);

  if (params.target.platform === 'web') {
    return captureWebScreenshot({
      url: params.target.value,
      outputPath,
    });
  }

  return captureIosScreenshot({
    scenario: params.target.value,
    outputPath,
    repoRoot: params.repoRoot,
  });
}
