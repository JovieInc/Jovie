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

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCaptureTarget } from '../lib/capture-target';
import { fetchTasteInbox } from '../lib/linear';
import {
  type DashboardIssueView,
  renderTasteInboxHtml,
} from '../lib/render-dashboard';
import { captureScreenshotForTarget } from '../lib/screenshots';
import { notifyTasteSlackCardsForIssues } from '../lib/taste-slack/notify';

const CONSOLE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const REPO_ROOT = path.resolve(CONSOLE_ROOT, '../..');
const PUBLIC_DIR = path.join(CONSOLE_ROOT, 'public/taste-inbox');
const SCREENSHOT_DIR = path.join(PUBLIC_DIR, 'screenshots');
const INDEX_PATH = path.join(PUBLIC_DIR, 'index.html');
const SLACK_CARD_STORE_PATH = path.join(
  CONSOLE_ROOT,
  'data/taste-slack-cards.json'
);

export async function runTasteInboxSweep(): Promise<{
  readonly indexPath: string;
  readonly issueCount: number;
  readonly tasteCount: number;
  readonly humanCount: number;
  readonly screenshotsCaptured: number;
  readonly fetchedAt: string;
  readonly available: boolean;
  readonly slackPosted: number;
  readonly slackSkipped: number;
  readonly slackFailed: number;
}> {
  const apiKey = process.env.LINEAR_API_KEY;
  const inbox = await fetchTasteInbox(apiKey);

  const views: DashboardIssueView[] = [];

  for (const issue of inbox.issues) {
    if (issue.label !== 'needs:taste') {
      views.push(issue);
      continue;
    }

    const target = parseCaptureTarget(issue.description);
    if (!target) {
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
      outputDir: SCREENSHOT_DIR,
      repoRoot: REPO_ROOT,
    });

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
  });

  await writeFile(INDEX_PATH, html, 'utf8');

  const slackNotify = await notifyTasteSlackCardsForIssues(
    inbox.issues,
    SLACK_CARD_STORE_PATH
  );

  return {
    indexPath: INDEX_PATH,
    issueCount: views.length,
    tasteCount: views.filter(issue => issue.label === 'needs:taste').length,
    humanCount: views.filter(issue => issue.label === 'needs:human').length,
    screenshotsCaptured: views.filter(issue => issue.screenshotPath).length,
    fetchedAt: inbox.fetchedAt,
    available: inbox.available,
    slackPosted: slackNotify.posted,
    slackSkipped: slackNotify.skipped,
    slackFailed: slackNotify.failed,
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
