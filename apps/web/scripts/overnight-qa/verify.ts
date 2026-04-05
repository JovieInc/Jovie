import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inferSurfaceFromText, surfacePriority } from './manifest';
import type {
  CommandExecutionResult,
  ManagedServer,
  OvernightIssue,
  OvernightIssueSurface,
  OvernightSuiteDefinition,
  SuiteRunResult,
  SweepResult,
  VerificationStep,
} from './types';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(SCRIPT_DIR, '..', '..');
const REPO_ROOT = resolve(WEB_ROOT, '..', '..');

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
  readonly line?: number;
  readonly column?: number;
  readonly suites?: readonly PlaywrightJsonSuite[];
  readonly specs?: readonly PlaywrightJsonSpec[];
}

interface PlaywrightJsonSpec {
  readonly title: string;
  readonly file?: string;
  readonly line?: number;
  readonly column?: number;
  readonly tests?: readonly PlaywrightJsonTest[];
}

interface PlaywrightJsonTest {
  readonly results?: readonly PlaywrightJsonResult[];
}

interface PlaywrightJsonResult {
  readonly status?: string;
  readonly error?: {
    readonly message?: string;
    readonly stack?: string;
  };
  readonly errors?: ReadonlyArray<{
    readonly message?: string;
    readonly stack?: string;
  }>;
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

export async function findFreePort() {
  return await new Promise<number>((resolvePromise, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to resolve a free port.'));
        return;
      }

      server.close(error => {
        if (error) {
          reject(error);
          return;
        }

        resolvePromise(address.port);
      });
    });
  });
}

async function waitForServer(
  baseUrl: string,
  server: ReturnType<typeof spawn>
) {
  const deadline = Date.now() + 180_000;

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error('Managed dev server exited before becoming ready.');
    }

    try {
      const response = await fetch(baseUrl, {
        signal: AbortSignal.timeout(5_000),
      });
      if (response.status < 500) {
        return;
      }
    } catch {
      // Keep polling until the server is up.
    }

    await new Promise(resolvePromise => setTimeout(resolvePromise, 1_000));
  }

  throw new Error(
    'Managed dev server did not become ready within 180 seconds.'
  );
}

export async function startManagedDevServer(
  runDir: string
): Promise<ManagedServer> {
  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const stdoutPath = resolve(runDir, 'logs', 'dev-server.stdout.log');
  const stderrPath = resolve(runDir, 'logs', 'dev-server.stderr.log');
  await mkdir(dirname(stdoutPath), { recursive: true });

  const server = spawn(
    'doppler',
    [
      'run',
      '--project',
      'jovie-web',
      '--config',
      'dev',
      '--',
      'pnpm',
      'run',
      'dev:local:playwright',
    ],
    {
      cwd: WEB_ROOT,
      env: {
        ...process.env,
        PORT: String(port),
        BASE_URL: baseUrl,
        E2E_SKIP_WEB_SERVER: '1',
        E2E_USE_TEST_AUTH_BYPASS: '1',
        E2E_FAST_ONBOARDING: '1',
        E2E_TEST_AUTH_PERSONA: 'creator',
        NEXT_PUBLIC_CLERK_MOCK: '1',
        NEXT_PUBLIC_CLERK_PROXY_DISABLED: '1',
        NEXT_PUBLIC_E2E_MODE: '1',
        NEXT_DISABLE_TOOLBAR: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  server.stdout?.on('data', async chunk => {
    await writeFile(stdoutPath, chunk, { flag: 'a' });
  });
  server.stderr?.on('data', async chunk => {
    await writeFile(stderrPath, chunk, { flag: 'a' });
  });

  await waitForServer(baseUrl, server);

  return {
    port,
    baseUrl,
    stdoutPath,
    stderrPath,
    stop: async () => {
      if (server.exitCode !== null) {
        return;
      }

      server.kill('SIGTERM');
      await new Promise(resolvePromise => setTimeout(resolvePromise, 1_000));
      if (server.exitCode === null) {
        server.kill('SIGKILL');
      }
    },
  };
}

export function runCommand(
  command: readonly string[],
  options: {
    readonly cwd?: string;
    readonly env?: Readonly<Record<string, string>>;
  } = {}
): CommandExecutionResult {
  const [binary, ...args] = command;
  const result = spawnSync(binary, args, {
    cwd: options.cwd ?? WEB_ROOT,
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });

  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

async function writeCommandArtifacts(
  runDir: string,
  suite: OvernightSuiteDefinition,
  result: CommandExecutionResult
) {
  const stdoutPath = resolve(runDir, 'logs', `${suite.id}.stdout.log`);
  const stderrPath = resolve(runDir, 'logs', `${suite.id}.stderr.log`);
  await mkdir(dirname(stdoutPath), { recursive: true });
  await writeFile(stdoutPath, result.stdout, 'utf8');
  await writeFile(stderrPath, result.stderr, 'utf8');

  let reportPath: string | undefined;
  if (suite.reportFileName) {
    reportPath = resolve(runDir, 'reports', suite.reportFileName);
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, result.stdout, 'utf8');
  }

  return { stdoutPath, stderrPath, reportPath };
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

async function parseRouteQaIssues(
  suite: OvernightSuiteDefinition
): Promise<readonly OvernightIssue[]> {
  const outputDir = suite.env?.ROUTE_QA_OUTPUT_DIR ?? 'overnight-route-qa';
  const findingsPath = resolve(
    WEB_ROOT,
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

async function parsePlaywrightIssues(
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

  const report = JSON.parse(raw) as PlaywrightJsonReport;
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

function dedupeAndSortIssues(issues: readonly OvernightIssue[]) {
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

export async function runSweepSuites(
  suites: readonly OvernightSuiteDefinition[],
  runDir: string
): Promise<SweepResult> {
  const suiteResults: SuiteRunResult[] = [];
  const allIssues: OvernightIssue[] = [];

  for (const suite of suites) {
    const execution = runCommand(suite.command, {
      cwd: WEB_ROOT,
      env: suite.env,
    });
    const artifacts = await writeCommandArtifacts(runDir, suite, execution);

    let issues: readonly OvernightIssue[] = [];
    if (suite.kind === 'route-qa') {
      issues = await parseRouteQaIssues(suite);
    } else if (artifacts.reportPath) {
      issues = await parsePlaywrightIssues(suite, artifacts.reportPath);
    }
    allIssues.push(...issues);

    suiteResults.push({
      id: suite.id,
      label: suite.label,
      kind: suite.kind,
      command: suite.command,
      status: execution.code === 0 ? 'pass' : 'fail',
      issuesFound: issues.length,
      artifactPaths: unique(
        [
          artifacts.stdoutPath,
          artifacts.stderrPath,
          artifacts.reportPath,
          ...(suite.kind === 'route-qa'
            ? [
                resolve(
                  WEB_ROOT,
                  'test-results',
                  'route-qa',
                  suite.env?.ROUTE_QA_OUTPUT_DIR ?? 'overnight-route-qa'
                ),
              ]
            : []),
        ].filter((value): value is string => Boolean(value))
      ),
      stdoutPath: artifacts.stdoutPath,
      stderrPath: artifacts.stderrPath,
      reportPath: artifacts.reportPath,
    });
  }

  return {
    suites: suiteResults,
    issues: dedupeAndSortIssues(allIssues),
  };
}

export function buildStandardVerificationSteps(
  issue: OvernightIssue,
  changedFiles: readonly string[]
): readonly VerificationStep[] {
  const biomeTargets =
    changedFiles.length > 0
      ? changedFiles.map(file => relative(WEB_ROOT, resolve(REPO_ROOT, file)))
      : ['.'];
  const fileScopedBiomeArgs =
    biomeTargets.length > 0
      ? ['pnpm', 'exec', 'biome', 'check', ...biomeTargets]
      : ['pnpm', 'exec', 'biome', 'check', '.'];

  return [
    ...issue.verificationSteps,
    {
      id: `${issue.key}-typecheck`,
      label: 'TypeScript verification',
      kind: 'command',
      command: [
        'pnpm',
        'exec',
        'tsc',
        '--noEmit',
        '-p',
        'tsconfig.typecheck.json',
      ],
    },
    {
      id: `${issue.key}-biome`,
      label: 'Scoped Biome check',
      kind: 'command',
      command: fileScopedBiomeArgs,
    },
  ];
}

export function runVerificationSteps(
  runDir: string,
  issueKey: string,
  steps: readonly VerificationStep[]
) {
  const results = steps.map(step => {
    const result = runCommand(step.command, {
      cwd: WEB_ROOT,
      env: step.env,
    });

    return {
      step,
      result,
    };
  });

  const failures = results.filter(entry => entry.result.code !== 0);
  const writes = Promise.all(
    results.map(async ({ step, result }) => {
      const baseName = `${sanitizeComponent(issueKey)}-${sanitizeComponent(
        step.id
      )}`;
      await mkdir(resolve(runDir, 'logs'), { recursive: true });
      await writeFile(
        resolve(runDir, 'logs', `${baseName}.stdout.log`),
        result.stdout,
        'utf8'
      );
      await writeFile(
        resolve(runDir, 'logs', `${baseName}.stderr.log`),
        result.stderr,
        'utf8'
      );
    })
  );

  return {
    ok: failures.length === 0,
    failures,
    writes,
  };
}
