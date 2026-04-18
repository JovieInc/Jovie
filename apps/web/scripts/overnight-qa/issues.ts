import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { inferSurfaceFromText, surfacePriority } from './manifest';
import { OVERNIGHT_WEB_ROOT } from './paths';
import type {
  OvernightIssue,
  OvernightIssueSurface,
  OvernightSuiteDefinition,
  VerificationStep,
} from './types';

interface RouteQaFinding {
  readonly id: string;
  readonly lane: string;
  readonly path: string;
  readonly status: 'pass' | 'fail' | 'blocked';
  readonly consoleErrors: readonly string[];
  readonly pageErrors: readonly string[];
  readonly screenshotPath?: string;
}

interface PlaywrightJsonReport {
  readonly suites?: readonly PlaywrightJsonSuite[];
}

interface PlaywrightJsonSuite {
  readonly title?: string;
  readonly file?: string;
  readonly suites?: readonly PlaywrightJsonSuite[];
  readonly specs?: readonly PlaywrightJsonSpec[];
}

interface PlaywrightJsonSpec {
  readonly title: string;
  readonly file?: string;
  readonly tests?: readonly PlaywrightJsonTest[];
}

interface PlaywrightJsonTest {
  readonly results?: readonly PlaywrightJsonResult[];
}

interface PlaywrightJsonResult {
  readonly status?: string;
  readonly error?: {
    readonly message?: string;
  };
  readonly errors?: ReadonlyArray<{
    readonly message?: string;
  }>;
}

function isPlaywrightJsonReport(value: unknown): value is PlaywrightJsonReport {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const report = value as Record<string, unknown> & {
    readonly suites?: unknown;
  };

  if (Array.isArray(report.suites)) {
    return true;
  }

  return Object.keys(report).length === 0;
}

function parsePlaywrightJsonCandidate(candidate: string) {
  const parsed = JSON.parse(candidate) as unknown;
  return isPlaywrightJsonReport(parsed) ? parsed : null;
}

function sanitizeComponent(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

function buildIssueKey(parts: readonly string[]) {
  return parts
    .map(part => sanitizeComponent(part))
    .filter(Boolean)
    .join('|');
}

function unique<T>(values: readonly T[]) {
  return [...new Set(values)];
}

function mapRouteLaneToSurface(lane: string): OvernightIssueSurface {
  if (lane === 'admin') return 'admin';
  if (lane === 'creator-app') return 'creator';
  if (lane === 'account-billing-onboarding') return 'billing';
  if (lane === 'public-profile') return 'public-profile';
  if (lane === 'auth') return 'auth';
  if (lane === 'public-no-auth') return 'marketing';
  return inferSurfaceFromText(lane);
}

export async function parseRouteQaIssues(
  suite: OvernightSuiteDefinition
): Promise<readonly OvernightIssue[]> {
  const outputDir = suite.env?.ROUTE_QA_OUTPUT_DIR ?? 'overnight-route-qa';
  const findingsPath = resolve(
    OVERNIGHT_WEB_ROOT,
    'test-results',
    'route-qa',
    outputDir,
    'findings-ledger.json'
  );

  if (!existsSync(findingsPath)) {
    return [];
  }

  const raw = await readFile(findingsPath, 'utf8');
  const findings = JSON.parse(raw) as readonly RouteQaFinding[];

  return findings
    .filter(finding => finding.status === 'fail')
    .map(finding => {
      const signature =
        finding.pageErrors[0] ??
        finding.consoleErrors[0] ??
        `${finding.path} failed`;
      const verificationSteps: readonly VerificationStep[] = [
        {
          id: `${finding.id}-route-qa-rerun`,
          label: `Route QA rerun for ${finding.path}`,
          kind: 'route-qa',
          command: ['pnpm', 'run', 'qa:routes'],
          env: {
            ROUTE_QA_BASE_URL:
              suite.env?.ROUTE_QA_BASE_URL ?? 'http://127.0.0.1:3000',
            ROUTE_QA_OUTPUT_DIR: outputDir,
            ROUTE_QA_FILTER: finding.path,
          },
        },
      ];

      return {
        key: buildIssueKey([suite.id, finding.path, signature]),
        suiteId: suite.id,
        source: 'route-qa',
        surface: mapRouteLaneToSurface(finding.lane),
        path: finding.path,
        summary: `${finding.path}: ${signature}`,
        signature,
        evidencePaths: unique(
          [finding.screenshotPath, findingsPath].filter(
            (value): value is string => Boolean(value)
          )
        ),
        discoveredAt: new Date().toISOString(),
        priority:
          suite.priority * 1000 +
          surfacePriority(mapRouteLaneToSurface(finding.lane)),
        verificationSteps,
        failureContext: [...finding.pageErrors, ...finding.consoleErrors].join(
          '\n'
        ),
        routeFilter: finding.path,
        testFile: null,
      } satisfies OvernightIssue;
    });
}

function collectPlaywrightFailures(
  suites: readonly PlaywrightJsonSuite[],
  failures: Array<{
    file: string | null;
    title: string;
    message: string;
  }>,
  parentTitles: readonly string[] = []
) {
  for (const suite of suites) {
    const nextParentTitles = suite.title
      ? [...parentTitles, suite.title]
      : [...parentTitles];

    for (const spec of suite.specs ?? []) {
      const firstFailure = spec.tests
        ?.flatMap(testCase => testCase.results ?? [])
        .find(
          result => result.status === 'failed' || result.status === 'timedOut'
        );

      if (firstFailure) {
        const message =
          firstFailure.error?.message ??
          firstFailure.errors?.[0]?.message ??
          'Playwright reported a failure without an error message.';
        failures.push({
          file: spec.file ?? suite.file ?? null,
          title: [...nextParentTitles, spec.title].filter(Boolean).join(' > '),
          message,
        });
      }
    }

    collectPlaywrightFailures(suite.suites ?? [], failures, nextParentTitles);
  }
}

function extractJsonObject(raw: string, start: number) {
  if (raw[start] !== '{') {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = start; index < raw.length; index += 1) {
    const char = raw[index];

    if (inString) {
      if (escaping) {
        escaping = false;
        continue;
      }

      if (char === '\\') {
        escaping = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char !== '}') {
      continue;
    }

    depth -= 1;
    if (depth === 0) {
      return raw.slice(start, index + 1);
    }
  }

  return null;
}

function parsePlaywrightJsonReport(raw: string): PlaywrightJsonReport {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {};
  }

  if (trimmed.startsWith('{')) {
    try {
      const parsed = parsePlaywrightJsonCandidate(trimmed);
      if (parsed) {
        return parsed;
      }
    } catch {
      // Fall through to scanning so we can tolerate trailing noise.
    }
  }

  for (let index = 0; index < raw.length; index += 1) {
    if (raw[index] !== '{') {
      continue;
    }

    let cursor = index - 1;
    while (cursor >= 0 && (raw[cursor] === ' ' || raw[cursor] === '\t')) {
      cursor -= 1;
    }

    const isJsonStart =
      cursor < 0 || raw[cursor] === '\n' || raw[cursor] === '\r';

    if (!isJsonStart) {
      continue;
    }

    const candidate = extractJsonObject(raw, index);
    if (!candidate) {
      continue;
    }

    try {
      const parsed = parsePlaywrightJsonCandidate(candidate);
      if (parsed) {
        return parsed;
      }
    } catch {
      // Keep scanning in case the first brace belonged to a log line.
    }
  }

  throw new Error('Unable to parse Playwright JSON report.');
}

export async function parsePlaywrightIssues(
  suite: OvernightSuiteDefinition,
  reportPath: string
): Promise<readonly OvernightIssue[]> {
  if (!existsSync(reportPath)) {
    return [];
  }

  const raw = await readFile(reportPath, 'utf8');
  if (!raw.trim()) {
    return [];
  }

  let report: PlaywrightJsonReport;
  try {
    report = parsePlaywrightJsonReport(raw);
  } catch (error) {
    const surface = suite.failureSurface ?? 'unknown';
    const message =
      error instanceof Error
        ? error.message
        : 'Unknown report parsing failure.';
    const verificationSteps: readonly VerificationStep[] = [
      {
        id: `${suite.id}-playwright-rerun`,
        label: `Rerun ${suite.label}`,
        kind: 'playwright',
        command: suite.command,
        env: suite.env,
      },
    ];

    return [
      {
        key: buildIssueKey([suite.id, 'report-parse-failed']),
        suiteId: suite.id,
        source: 'playwright',
        surface,
        path: null,
        summary: `${suite.label}: unable to parse Playwright JSON report`,
        signature: 'Unable to parse Playwright JSON report',
        evidencePaths: [reportPath],
        discoveredAt: new Date().toISOString(),
        priority: suite.priority * 1000 + surfacePriority(surface),
        verificationSteps,
        failureContext: `${message}\nReport: ${reportPath}`,
        routeFilter: null,
        testFile: null,
      } satisfies OvernightIssue,
    ];
  }

  const failures: Array<{
    file: string | null;
    title: string;
    message: string;
  }> = [];
  collectPlaywrightFailures(report.suites ?? [], failures);

  return failures.map(failure => {
    const verificationSteps: readonly VerificationStep[] = [
      {
        id: `${suite.id}-playwright-rerun`,
        label: `Rerun ${failure.file ?? suite.id}`,
        kind: 'playwright',
        command: suite.command,
        env: suite.env,
      },
    ];

    const fileOrTitle = failure.file ?? failure.title;
    const surface = inferSurfaceFromText(
      `${suite.label} ${fileOrTitle} ${failure.message}`,
      suite.failureSurface ?? 'unknown'
    );

    return {
      key: buildIssueKey([suite.id, fileOrTitle, failure.message]),
      suiteId: suite.id,
      source: 'playwright',
      surface,
      path: failure.file,
      summary: `${failure.title}: ${failure.message}`,
      signature: failure.message,
      evidencePaths: [reportPath],
      discoveredAt: new Date().toISOString(),
      priority: suite.priority * 1000 + surfacePriority(surface),
      verificationSteps,
      failureContext: `${failure.title}\n${failure.message}`,
      routeFilter: null,
      testFile: failure.file,
    } satisfies OvernightIssue;
  });
}

export function dedupeAndSortIssues(issues: readonly OvernightIssue[]) {
  const deduped = new Map<string, OvernightIssue>();

  for (const issue of issues) {
    const existing = deduped.get(issue.key);
    if (!existing || issue.priority < existing.priority) {
      deduped.set(issue.key, issue);
    }
  }

  return [...deduped.values()].sort((left, right) => {
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }

    if ((left.path ?? '') !== (right.path ?? '')) {
      return (left.path ?? '').localeCompare(right.path ?? '');
    }

    return left.signature.localeCompare(right.signature);
  });
}
