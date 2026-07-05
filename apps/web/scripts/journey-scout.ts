/**
 * Journey Scout — exploratory crawler for the Production Journey Auditor.
 *
 * Reads the product-promise registry, visits each entrypoint, observes the
 * before/after state of clicking the primary CTA (screenshot + DOM text +
 * accessibility tree), and classifies what it finds into a fixed taxonomy.
 * It is REPORT-ONLY by default: it writes a markdown report + evidence to
 * .context/journey-scout/<runId>/ and files ZERO issues unless --file-issues
 * is passed (which currently only prints what it *would* file — wiring it to
 * Linear is a deliberate follow-up, not a silent capability).
 *
 * ponytail: standalone Playwright script rather than extending route-qa.ts.
 * route-qa sweeps route *status*; this clicks CTAs, diffs state, and classifies
 * journeys — different job. It reuses route-qa's conventions (BASE_URL default,
 * /api/dev/test-auth bootstrap) without coupling to its internals.
 *
 * Run:  doppler run --project jovie-web --config dev -- pnpm tsx scripts/journey-scout.ts
 *       JOURNEY_SCOUT_BASE_URL=https://staging.jov.ie ... (defaults to localhost:3000)
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Browser, chromium, type Page } from 'playwright';
import {
  PRODUCT_PROMISES,
  type ProductPromise,
} from '../lib/qa/product-promises';

const BASE_URL =
  process.env.JOURNEY_SCOUT_BASE_URL?.trim() || 'http://localhost:3000';
const FILE_ISSUES = process.argv.includes('--file-issues');
const RUN_ID = new Date()
  .toISOString()
  .replace(/[:.]/g, '-')
  .replace('T', '_')
  .slice(0, 19);
const OUT_DIR = join(
  process.cwd(),
  '..',
  '..',
  '.context',
  'journey-scout',
  RUN_ID
);

type Classification =
  | 'dead-cta'
  | 'broken-journey-start'
  | 'infinite-pending'
  | 'silent-auth-failure'
  | 'ai-contract-failure'
  | 'no-empty-state-recovery'
  | 'fake-metric-or-control'
  | 'visual-brokenness'
  | 'acceptable-expectation-mismatch';

/** Classifications that represent a real broken promise (worth a test/issue). */
const BROKEN: ReadonlySet<Classification> = new Set([
  'dead-cta',
  'broken-journey-start',
  'infinite-pending',
  'silent-auth-failure',
  'ai-contract-failure',
  'no-empty-state-recovery',
  'fake-metric-or-control',
  'visual-brokenness',
]);

interface Finding {
  readonly promiseId: string;
  readonly route: string;
  readonly classification: Classification;
  readonly severity: 'P0' | 'P1' | 'P2';
  readonly evidence: string[];
  readonly beforeShot?: string;
  readonly afterShot?: string;
}

// Tokens / secrets / PII are stripped from any saved DOM text.
const SECRET_PATTERN =
  /(?:token|key|secret|password|authorization|cookie|bearer|email)[=: ][^\s"']{4,}/gi;
const TOKEN_SHAPED = /\b(?:sk|pk|rk|whsec|ey)[A-Za-z0-9_-]{8,}\b/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

function redact(text: string): string {
  return text
    .replace(SECRET_PATTERN, '[REDACTED]')
    .replace(TOKEN_SHAPED, '[REDACTED]')
    .replace(EMAIL, '[REDACTED-EMAIL]');
}

async function bootstrapAuth(page: Page, persona: string): Promise<void> {
  // Local dev auth bypass (see .claude/rules/auth.md). No-op-safe on prod URLs
  // (the route 404s there; the scout still records what an anon user sees).
  try {
    await page.goto(
      `${BASE_URL}/api/dev/test-auth/enter?persona=${persona}&redirect=/app`,
      { waitUntil: 'domcontentloaded', timeout: 30_000 }
    );
  } catch {
    /* best-effort */
  }
}

async function capture(
  page: Page,
  label: string
): Promise<{ shot: string; text: string; a11y: string }> {
  const shot = join(OUT_DIR, `${label}.png`);
  try {
    await page.screenshot({ path: shot, fullPage: true });
  } catch {
    /* page may be navigating */
  }
  const text = redact(
    (await page
      .locator('body')
      .innerText()
      .catch(() => '')) || ''
  );
  // page.accessibility was removed in newer Playwright; use the ARIA snapshot
  // when available and degrade gracefully otherwise.
  let a11y = '{}';
  try {
    const snapshot = await page
      .locator('body')
      .ariaSnapshot()
      .catch(() => '');
    a11y = redact(String(snapshot)).slice(0, 4000);
  } catch {
    /* a11y snapshot unavailable — screenshot + DOM text still captured */
  }
  return { shot, text, a11y };
}

/** Heuristic: the primary CTA on a journey-start surface. */
async function findPrimaryCta(page: Page) {
  const candidates = [
    page.locator('[data-testid*="cta"]:visible').first(),
    page
      .getByRole('button', {
        name: /get started|start|sign up|connect|continue|send message/i,
      })
      .first(),
    page
      .getByRole('link', { name: /get started|start|sign up|continue/i })
      .first(),
  ];
  for (const c of candidates) {
    if (
      await c
        .count()
        .then(n => n > 0)
        .catch(() => false)
    ) {
      if (await c.isVisible().catch(() => false)) return c;
    }
  }
  return null;
}

function hasSpinnerOnly(text: string): boolean {
  const t = text.trim().toLowerCase();
  return t.length < 40 && /loading|loading…|please wait|^$/.test(t);
}

async function scoutPromise(
  page: Page,
  promise: ProductPromise
): Promise<Finding | null> {
  const route = promise.entrypoint;
  const evidence: string[] = [];

  // --- Load the entrypoint ---
  const pageErrors: string[] = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  let status = 0;
  try {
    const resp = await page.goto(`${BASE_URL}${route}`, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });
    status = resp?.status() ?? 0;
  } catch (e) {
    evidence.push(`navigation threw: ${(e as Error).message}`);
    const before = await capture(page, `${promise.id}-load-error`);
    return {
      promiseId: promise.id,
      route,
      classification: 'broken-journey-start',
      severity: 'P0',
      evidence,
      beforeShot: before.shot,
    };
  }

  const before = await capture(page, `${promise.id}-before`);

  if (status >= 500) {
    evidence.push(`entrypoint returned HTTP ${status}`);
    return {
      promiseId: promise.id,
      route,
      classification: 'broken-journey-start',
      severity: 'P0',
      evidence,
      beforeShot: before.shot,
    };
  }

  // Unexpected bounce to sign-in while we expected an authed surface.
  if (!promise.anonymous && /\/(signin|sign-in|signup)\b/.test(page.url())) {
    evidence.push(`redirected to ${page.url()} (auth bounce)`);
    return {
      promiseId: promise.id,
      route,
      classification: 'silent-auth-failure',
      severity: 'P1',
      evidence,
      beforeShot: before.shot,
    };
  }

  // --- Promise-specific deep check: the anonymous onboarding turn ---
  if (promise.id === 'anonymous-signup-onboarding-starts') {
    const composer = page.getByRole('textbox', {
      name: /chat message input/i,
    });
    // Wait for hydration: the composer is server-rendered but only editable
    // once the client mounts. Poll up to 20s before declaring the init broken.
    const editable = await composer
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => composer.isEditable())
      .catch(() => false);
    if (!editable) {
      evidence.push('composer never became editable');
      return {
        promiseId: promise.id,
        route,
        classification: 'broken-journey-start',
        severity: 'P0',
        evidence,
        beforeShot: before.shot,
      };
    }
    await composer.fill('I make indie pop, help me set up my profile.');
    await page
      .getByRole('button', { name: /send message/i })
      .click()
      .catch(() => {});
    // Wait for a reply, a known fallback, or give up (infinite/error).
    const reply = page.getByTestId('chat-message-reply');
    const fallback = page.getByText(
      /Jovie hit a temporary issue|still connecting|temporarily unavailable/i
    );
    const resolved = await reply
      .or(fallback)
      .first()
      .isVisible({ timeout: 45_000 })
      .catch(() => false);
    const after = await capture(page, `${promise.id}-after-turn`);
    if (!resolved) {
      evidence.push(
        'turn produced neither an AI reply nor a known fallback within 45s (stuck/loading or 500)'
      );
      return {
        promiseId: promise.id,
        route,
        classification: 'ai-contract-failure',
        severity: 'P0',
        evidence,
        beforeShot: before.shot,
        afterShot: after.shot,
      };
    }
    return null; // promise kept
  }

  // --- Generic CTA click + state diff for the other promises ---
  const cta = await findPrimaryCta(page);
  if (!cta) {
    // No CTA + a near-empty body with no explicit empty-state component.
    if (hasSpinnerOnly(before.text)) {
      evidence.push('surface shows only a spinner / blank with no CTA');
      return {
        promiseId: promise.id,
        route,
        classification: 'infinite-pending',
        severity: 'P1',
        evidence,
        beforeShot: before.shot,
      };
    }
    return null; // nothing actionable to classify; not necessarily broken
  }

  const urlBefore = page.url();
  await cta.click({ timeout: 5_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const after = await capture(page, `${promise.id}-after`);
  const urlChanged = page.url() !== urlBefore;
  const domChanged = after.text.trim() !== before.text.trim();

  if (!urlChanged && !domChanged && pageErrors.length === 0) {
    evidence.push('primary CTA produced no navigation and no DOM change');
    return {
      promiseId: promise.id,
      route,
      classification: 'dead-cta',
      severity: 'P1',
      evidence,
      beforeShot: before.shot,
      afterShot: after.shot,
    };
  }

  if (hasSpinnerOnly(after.text)) {
    evidence.push('after CTA, surface is stuck on a spinner');
    return {
      promiseId: promise.id,
      route,
      classification: 'infinite-pending',
      severity: 'P1',
      evidence,
      beforeShot: before.shot,
      afterShot: after.shot,
    };
  }

  return null; // promise kept (acceptable)
}

/** A proposed deterministic Playwright test for a confirmed broken promise. */
function proposeTest(finding: Finding): string {
  return [
    '```ts',
    `// Proposed regression test for ${finding.promiseId} (${finding.classification})`,
    `test('${finding.promiseId}: journey is not ${finding.classification}', async ({ page }) => {`,
    `  const resp = await page.goto('${finding.route}');`,
    `  expect(resp?.status() ?? 0).toBeLessThan(400);`,
    finding.classification === 'ai-contract-failure'
      ? [
          `  const composer = page.getByRole('textbox', { name: /chat message input/i });`,
          `  await expect(composer).toBeEditable();`,
          `  await composer.fill('test answer');`,
          `  await page.getByRole('button', { name: /send message/i }).click();`,
          `  const reply = page.getByTestId('chat-message-reply');`,
          `  const fallback = page.getByText(/temporary issue|still connecting|temporarily unavailable/i);`,
          `  await expect(reply.or(fallback).first()).toBeVisible({ timeout: 45_000 });`,
        ].join('\n')
      : finding.classification === 'dead-cta'
        ? `  // Click the primary CTA and assert navigation or a visible state change.`
        : `  // Assert an explicit empty/loading/error state, never a blank or spinner.`,
    `});`,
    '```',
  ].join('\n');
}

function writeReport(findings: Finding[]): string {
  const broken = findings.filter(f => BROKEN.has(f.classification));
  const lines: string[] = [
    `# Journey Scout report — ${RUN_ID}`,
    '',
    `- Base URL: ${BASE_URL}`,
    `- Promises checked: ${PRODUCT_PROMISES.length}`,
    `- Findings: ${findings.length} (${broken.length} broken)`,
    `- Mode: report-only${FILE_ISSUES ? ' (--file-issues: would file below)' : ''}`,
    '',
    '> Report-only. No Linear issues created. Each broken promise below includes',
    '> evidence and a proposed deterministic regression test.',
    '',
  ];

  if (findings.length === 0) {
    lines.push('All promises kept. No findings.');
  }

  for (const f of findings) {
    lines.push(`## ${f.promiseId} — \`${f.classification}\` (${f.severity})`);
    lines.push(`- Route: \`${f.route}\``);
    for (const e of f.evidence) lines.push(`- Evidence: ${e}`);
    if (f.beforeShot) lines.push(`- Before: \`${f.beforeShot}\``);
    if (f.afterShot) lines.push(`- After: \`${f.afterShot}\``);
    if (BROKEN.has(f.classification)) {
      lines.push('', '### Proposed test', proposeTest(f));
    }
    lines.push('');
  }

  const reportPath = join(OUT_DIR, 'report.md');
  writeFileSync(reportPath, lines.join('\n'), 'utf8');
  return reportPath;
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  let browser: Browser | null = null;
  const findings: Finding[] = [];

  try {
    browser = await chromium.launch();
    for (const promise of PRODUCT_PROMISES) {
      const context = await browser.newContext();
      const page = await context.newPage();
      try {
        if (!promise.anonymous) await bootstrapAuth(page, 'creator-ready');
        const finding = await scoutPromise(page, promise);
        if (finding) findings.push(finding);
        process.stdout.write(
          `· ${promise.id}: ${finding ? finding.classification : 'ok'}\n`
        );
      } catch (e) {
        process.stdout.write(
          `· ${promise.id}: scout error — ${(e as Error).message}\n`
        );
      } finally {
        await context.close().catch(() => {});
      }
    }
  } finally {
    await browser?.close().catch(() => {});
  }

  const reportPath = writeReport(findings);
  const broken = findings.filter(f => BROKEN.has(f.classification));
  process.stdout.write(`\nReport: ${reportPath}\n`);
  if (FILE_ISSUES && broken.length > 0) {
    process.stdout.write(
      `--file-issues: would file ${broken.length} Linear issue(s) — wiring is a deliberate follow-up, not yet implemented.\n`
    );
  }
  // Report-only: never non-zero on findings (don't break CI by surfacing noise).
  process.exit(0);
}

void main();
