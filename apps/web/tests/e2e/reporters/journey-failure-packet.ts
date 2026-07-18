/**
 * Journey failure-packet reporter (Production Journey Auditor).
 *
 * On any failed/timed-out test, writes a compact, redacted JSON "failure packet"
 * next to the Playwright artifacts so a production smoke run surfaces a single
 * glanceable diagnosis without an HTML report. Wired into
 * playwright.synthetic.config.ts (the deployed-URL harness). CI deliberately
 * disables trace, video, and screenshots so public artifacts cannot retain
 * credentials or authenticated data; local runs may still attach them.
 *
 * Packet shape:
 *   { route, failedStep, status, screenshotPath, videoPath, tracePath,
 *     consoleErrors[], failedRequests[], errors[] }
 *
 * consoleErrors/failedRequests are read from optional test attachments named
 * `journey-console-errors` / `journey-failed-requests` (JSON arrays). When a
 * spec doesn't attach them, the redacted failing assertion text in `errors[]`
 * carries the detail. Attachment paths remain optional for local runs.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';

const OUTPUT_DIR = join(
  process.cwd(),
  'test-results',
  'journey-failure-packets'
);

// Mirrors tests/e2e/reporters/sentry-ci-reporter.ts redaction.
const SECRET_PATTERN =
  /(?:token|key|secret|password|authorization|cookie|dsn|credential|bearer)[=: ].{4,}/gi;
const TOKEN_SHAPED = /\b(?:sk|pk|rk|whsec|ey)[A-Za-z0-9_-]{8,}\b/g;

function redact(text: string): string {
  return text
    .replace(SECRET_PATTERN, m => {
      const sep = Math.max(m.indexOf('='), m.indexOf(':'), m.indexOf(' '));
      return `${m.slice(0, sep + 1)}[REDACTED]`;
    })
    .replace(TOKEN_SHAPED, '[REDACTED]');
}

function attachmentPath(
  result: TestResult,
  predicate: (name: string, contentType: string) => boolean
): string | undefined {
  const found = result.attachments.find(
    a => a.path && predicate(a.name, a.contentType)
  );
  return found?.path;
}

function readJsonAttachment(result: TestResult, name: string): string[] {
  const att = result.attachments.find(a => a.name === name && a.body);
  if (!att?.body) return [];
  try {
    const parsed = JSON.parse(att.body.toString('utf8'));
    return Array.isArray(parsed) ? parsed.map(v => redact(String(v))) : [];
  } catch {
    return [];
  }
}

/** Best-effort route from the test title or its file path. */
function deriveRoute(test: TestCase): string {
  const titleMatch = test
    .titlePath()
    .join(' ')
    .match(/\/[\w\-/[\]]*start\b|\/[\w\-/[\]]+/);
  return titleMatch?.[0] ?? test.location.file.split('/').pop() ?? 'unknown';
}

export default class JourneyFailurePacketReporter implements Reporter {
  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status !== 'failed' && result.status !== 'timedOut') return;

    const failedStep =
      result.steps.find(s => s.error)?.title ??
      result.errors[0]?.message?.split('\n')[0] ??
      'unknown';

    const packet = {
      test: test.titlePath().filter(Boolean).join(' › '),
      route: deriveRoute(test),
      failedStep: redact(failedStep),
      status: result.status,
      durationMs: result.duration,
      screenshotPath: attachmentPath(result, (_n, ct) =>
        ct.startsWith('image/')
      ),
      videoPath: attachmentPath(result, (_n, ct) => ct.startsWith('video/')),
      tracePath: attachmentPath(
        result,
        (n, ct) => n === 'trace' || ct === 'application/zip'
      ),
      consoleErrors: readJsonAttachment(result, 'journey-console-errors'),
      failedRequests: readJsonAttachment(result, 'journey-failed-requests'),
      errors: result.errors.map(e => redact(e.message ?? String(e))),
    };

    const safeName = packet.test.replace(/[^a-z0-9]+/gi, '-').slice(0, 120);
    const outPath = join(OUTPUT_DIR, `${safeName}.json`);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(packet, null, 2), 'utf8');

    // One compact line to the console so CI logs show the diagnosis inline.
    process.stdout.write(
      `\n[journey-failure-packet] ${packet.route} — ${packet.failedStep} → ${outPath}\n`
    );
  }
}
