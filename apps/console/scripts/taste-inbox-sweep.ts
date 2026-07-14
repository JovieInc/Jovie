#!/usr/bin/env tsx
/**
 * Taste Inbox sweep — fetch Linear issues, capture screenshots, republish HTML.
 *
 * Writes to stable paths under apps/console/public/taste-inbox/:
 * - index.html (dashboard)
 * - screenshots/<issue-id>.png (taste-call captures)
 *
 * Re-running overwrites the same files so the public URL stays stable.
 */

import { lstat, readdir, realpath, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCaptureTarget } from '../lib/capture-target';
import { fetchFactoryHealthMetrics } from '../lib/factory-health';
import { fetchTasteInbox } from '../lib/linear';
import {
  type DashboardIssueView,
  renderTasteInboxHtml,
} from '../lib/render-dashboard';
import { captureScreenshotForTarget } from '../lib/screenshots';

const CONSOLE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const REPO_ROOT = path.resolve(CONSOLE_ROOT, '../..');
const PUBLIC_DIR = path.join(CONSOLE_ROOT, 'public/taste-inbox');

const SAFE_SCREENSHOT_FILENAME = /^[a-zA-Z0-9._-]+\.png$/;

async function readPathStats(targetPath: string) {
  return lstat(targetPath).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  });
}

async function assertTasteOutputOwnership(
  publicDir: string,
  screenshotDir: string
): Promise<boolean> {
  const publicRoot = path.resolve(publicDir);
  const screenshotRoot = path.resolve(screenshotDir);
  if (path.dirname(screenshotRoot) !== publicRoot) {
    throw new Error('Taste Inbox screenshot root must be owned by publicDir');
  }

  const publicStats = await readPathStats(publicRoot);
  if (
    !publicStats?.isDirectory() ||
    publicStats.isSymbolicLink() ||
    (await realpath(publicRoot)) !== publicRoot
  ) {
    throw new Error('Taste Inbox publicDir must be a real canonical directory');
  }

  const screenshotStats = await readPathStats(screenshotRoot);
  if (!screenshotStats) return false;
  if (
    !screenshotStats.isDirectory() ||
    screenshotStats.isSymbolicLink() ||
    (await realpath(screenshotRoot)) !== screenshotRoot ||
    (await realpath(path.dirname(screenshotRoot))) !== publicRoot
  ) {
    throw new Error('Taste Inbox screenshot root must be a real directory');
  }

  return true;
}

export async function pruneUnreferencedTasteScreenshots(
  screenshotDir: string,
  referencedFilenames: ReadonlySet<string>
): Promise<void> {
  const resolvedScreenshotDir = path.resolve(screenshotDir);
  const publicDir = path.dirname(resolvedScreenshotDir);
  const screenshotRootExists = await assertTasteOutputOwnership(
    publicDir,
    resolvedScreenshotDir
  );
  if (!screenshotRootExists) return;

  const entries = await readdir(resolvedScreenshotDir, {
    withFileTypes: true,
  });

  for (const entry of entries) {
    if (
      !entry.isFile() ||
      !SAFE_SCREENSHOT_FILENAME.test(entry.name) ||
      referencedFilenames.has(entry.name)
    ) {
      continue;
    }

    const screenshotPath = path.join(resolvedScreenshotDir, entry.name);
    const currentStats = await readPathStats(screenshotPath);
    if (!currentStats?.isFile() || currentStats.isSymbolicLink()) continue;

    // Revalidate both owned roots immediately before unlinking. The operation
    // is flat-file only, so a raced directory or symlink is never traversed.
    await assertTasteOutputOwnership(publicDir, resolvedScreenshotDir);
    await unlink(screenshotPath);
  }
}

export async function runTasteInboxSweep(options?: {
  readonly publicDir?: string;
}): Promise<{
  readonly indexPath: string;
  readonly issueCount: number;
  readonly tasteCount: number;
  readonly humanCount: number;
  readonly screenshotsCaptured: number;
  readonly fetchedAt: string;
  readonly available: boolean;
}> {
  const publicDir = options?.publicDir ?? PUBLIC_DIR;
  const screenshotDir = path.join(publicDir, 'screenshots');
  const indexPath = path.join(publicDir, 'index.html');
  await assertTasteOutputOwnership(publicDir, screenshotDir);
  const apiKey = process.env.LINEAR_API_KEY;
  const [inbox, factoryHealth] = await Promise.all([
    fetchTasteInbox(apiKey),
    fetchFactoryHealthMetrics({
      linearApiKey: apiKey,
      githubToken:
        process.env.HUD_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN ?? undefined,
      githubOwner: process.env.HUD_GITHUB_OWNER,
      githubRepo: process.env.HUD_GITHUB_REPO,
    }),
  ]);

  const views: DashboardIssueView[] = [];
  const referencedScreenshotFilenames = new Set<string>();
  let allCapturesSucceeded = true;

  for (const issue of inbox.issues) {
    if (issue.label !== 'needs:taste') {
      views.push(issue);
      continue;
    }

    const target = parseCaptureTarget(issue.description);
    if (!target) {
      allCapturesSucceeded = false;
      views.push({
        ...issue,
        screenshotError:
          'Missing capture target — add `Capture: web <url>` or `Capture: ios <scenario>` to the issue description.',
      });
      continue;
    }

    const capture = await captureScreenshotForTarget({
      issueIdentifier: issue.identifier,
      target,
      outputDir: screenshotDir,
      repoRoot: REPO_ROOT,
    });

    if (capture.ok) {
      referencedScreenshotFilenames.add(path.basename(capture.outputPath));
    } else {
      allCapturesSucceeded = false;
    }

    views.push({
      ...issue,
      screenshotPath: capture.ok
        ? `screenshots/${path.basename(capture.outputPath)}`
        : undefined,
      screenshotError: capture.ok ? undefined : capture.error,
    });
  }

  const html = renderTasteInboxHtml({
    issues: views,
    fetchedAt: inbox.fetchedAt,
    available: inbox.available,
    error: inbox.error,
    factoryHealth,
  });

  await writeFile(indexPath, html, 'utf8');

  if (inbox.available && allCapturesSucceeded) {
    await pruneUnreferencedTasteScreenshots(
      screenshotDir,
      referencedScreenshotFilenames
    );
  }

  return {
    indexPath,
    issueCount: views.length,
    tasteCount: views.filter(issue => issue.label === 'needs:taste').length,
    humanCount: views.filter(issue => issue.label === 'needs:human').length,
    screenshotsCaptured: views.filter(issue => issue.screenshotPath).length,
    fetchedAt: inbox.fetchedAt,
    available: inbox.available,
  };
}

async function main(): Promise<void> {
  const result = await runTasteInboxSweep();
  process.stdout.write(`${JSON.stringify({ ok: true, ...result }, null, 2)}\n`);
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  void main().catch(error => {
    console.error('[taste-inbox-sweep] fatal:', error);
    process.exitCode = 1;
  });
}
