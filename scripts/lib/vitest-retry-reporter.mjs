/**
 * Vitest reporter that makes retried-then-passed ("flaky") tests visible.
 *
 * CI runs the web unit suite with `--retry`, so a test that fails once and
 * then passes leaves the step green and never shows up in logs or in the
 * nightly Test Flakiness Report. This reporter reads Vitest's own per-test
 * diagnostic (`retryCount` / `flaky`) and, at the end of the run:
 *   - prints one `::warning::` annotation per flaky test,
 *   - appends a table to `GITHUB_STEP_SUMMARY` when flakes exist,
 *   - writes a machine-readable JSON file the nightly report consumes.
 *
 * It is observability only: every side effect is best-effort and it never
 * changes the run outcome.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const FLAKY_REPORT_SCHEMA_VERSION = 2;

function escapeAnnotationProperty(value) {
  return String(value)
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A')
    .replace(/:/g, '%3A')
    .replace(/,/g, '%2C');
}

function escapeAnnotationMessage(value) {
  return String(value)
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A');
}

/**
 * Convert a finished Vitest TestCase into a flaky entry, or null when the
 * test did not pass after at least one retry.
 */
export function toFlakyEntry(testCase, workspaceRoot) {
  const result = testCase.result?.();
  if (result?.state !== 'passed') return null;
  const diagnostic = testCase.diagnostic?.();
  const retryCount = diagnostic?.retryCount ?? 0;
  if (!diagnostic?.flaky && retryCount < 1) return null;
  const moduleId = testCase.module?.moduleId ?? '';
  return {
    file: moduleId
      ? path.relative(workspaceRoot, moduleId).split(path.sep).join('/')
      : '',
    name: testCase.fullName,
    retryCount,
  };
}

export function formatAnnotation(entry) {
  const retries = entry.retryCount === 1 ? 'retry' : 'retries';
  return `::warning file=${escapeAnnotationProperty(entry.file)},title=${escapeAnnotationProperty('Flaky unit test')}::${escapeAnnotationMessage(`${entry.name} passed after ${entry.retryCount} ${retries}`)}`;
}

export function formatStepSummary(entries, label) {
  const cell = value => String(value).replace(/\|/g, '\\|');
  const lines = [
    `### Flaky unit tests${label ? ` (${label})` : ''}: ${entries.length}`,
    '',
    'These tests failed, then passed on retry. The run stays green; fix the race.',
    '',
    '| File | Test | Retries |',
    '|------|------|---------|',
    ...entries.map(
      entry =>
        `| \`${cell(entry.file)}\` | ${cell(entry.name)} | ${entry.retryCount} |`
    ),
    '',
  ];
  return `${lines.join('\n')}\n`;
}

export function executionReceipt(module, workspaceRoot, initialHash) {
  const file = path
    .relative(workspaceRoot, module.moduleId)
    .split(path.sep)
    .join('/');
  if (file.startsWith('../') || path.isAbsolute(file) || !initialHash)
    return null;
  let source;
  try {
    source = fs.readFileSync(module.moduleId);
  } catch {
    return null;
  }
  if (createHash('sha256').update(source).digest('hex') !== initialHash)
    return null;
  const cases = [...module.children.allTests()];
  let executedCount = 0;
  let skippedCount = 0;
  let retryCount = 0;
  let failed = false;
  const failures = [];
  for (const item of cases) {
    const result = item.result();
    if (!['passed', 'failed'].includes(result.state)) {
      skippedCount++;
      continue;
    }
    executedCount++;
    const retries = item.diagnostic()?.retryCount ?? 0;
    if (!Number.isSafeInteger(retries) || retries < 0) return null;
    retryCount += retries;
    failed ||= result.state === 'failed';
    for (const error of result.errors ?? []) {
      if (typeof error.message === 'string' && error.message.trim())
        failures.push({
          name: item.fullName,
          error: error.message.slice(0, 2000),
          outcome: result.state === 'failed' ? 'failed' : 'flaky',
        });
    }
  }
  const complete =
    ['passed', 'failed'].includes(module.state()) &&
    module.errors().length === 0 &&
    executedCount > 0 &&
    skippedCount === 0;
  return {
    file,
    fileHash: initialHash,
    executedCount,
    skippedCount,
    retryCount,
    outcome: failed ? 'failed' : retryCount > 0 ? 'flaky' : 'clean',
    complete,
    failures,
  };
}

export default class RetryVisibilityReporter {
  /**
   * @param {{ outputFile?: string, label?: string, workspaceRoot?: string,
   *   env?: NodeJS.ProcessEnv, log?: (line: string) => void }} [options]
   */
  constructor(options = {}) {
    this.env = options.env ?? process.env;
    this.outputFile = options.outputFile;
    this.label = options.label ?? '';
    this.workspaceRoot =
      options.workspaceRoot ?? this.env.GITHUB_WORKSPACE ?? process.cwd();
    this.log = options.log ?? (line => process.stdout.write(`${line}\n`));
    this.entries = [];
    this.moduleHashes = new Map();
    this.evidenceIncomplete = false;
  }

  onTestModuleStart(module) {
    try {
      const relative = path.relative(
        this.workspaceRoot,
        fs.realpathSync(module.moduleId)
      );
      if (relative.startsWith('../') || path.isAbsolute(relative))
        throw new Error('Foreign test module');
      this.moduleHashes.set(
        module.moduleId,
        createHash('sha256')
          .update(fs.readFileSync(module.moduleId))
          .digest('hex')
      );
    } catch {
      this.evidenceIncomplete = true;
    }
  }

  onTestCaseResult(testCase) {
    try {
      const entry = toFlakyEntry(testCase, this.workspaceRoot);
      if (entry) this.entries.push(entry);
    } catch {
      // Observability only: never affect the run.
    }
  }

  onTestRunEnd(modules = [], unhandledErrors = []) {
    const entries = [...this.entries].sort(
      (a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name)
    );
    try {
      for (const entry of entries) this.log(formatAnnotation(entry));
      if (entries.length > 0 && this.env.GITHUB_STEP_SUMMARY) {
        fs.appendFileSync(
          this.env.GITHUB_STEP_SUMMARY,
          formatStepSummary(entries, this.label)
        );
      }
      const executions = modules.map(module =>
        executionReceipt(
          module,
          this.workspaceRoot,
          this.moduleHashes.get(module.moduleId)
        )
      );
      const positive = value =>
        /^[1-9]\d*$/.test(value ?? '') && Number.isSafeInteger(Number(value))
          ? Number(value)
          : null;
      const run = {
        repository: this.env.GITHUB_REPOSITORY ?? null,
        headSha: this.env.GITHUB_SHA ?? null,
        runId: positive(this.env.GITHUB_RUN_ID),
        runAttempt: positive(this.env.GITHUB_RUN_ATTEMPT),
        event: this.env.GITHUB_EVENT_NAME ?? null,
        job: this.env.GITHUB_JOB ?? null,
      };
      if (this.outputFile) {
        fs.mkdirSync(path.dirname(path.resolve(this.outputFile)), {
          recursive: true,
        });
        fs.writeFileSync(
          this.outputFile,
          `${JSON.stringify(
            {
              schemaVersion: FLAKY_REPORT_SCHEMA_VERSION,
              label: this.label,
              flaky: entries,
              run,
              generatedAt: new Date().toISOString(),
              complete:
                !this.evidenceIncomplete &&
                unhandledErrors.length === 0 &&
                modules.length > 0 &&
                executions.every(Boolean),
              executions: executions.filter(Boolean),
            },
            null,
            2
          )}\n`
        );
      }
    } catch (error) {
      this.log(
        `::notice::Flaky-test reporter could not write its report: ${escapeAnnotationMessage(error?.message ?? error)}`
      );
    }
  }
}
