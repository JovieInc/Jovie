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
import fs from 'node:fs';
import path from 'node:path';

export const FLAKY_REPORT_SCHEMA_VERSION = 1;

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
  }

  onTestCaseResult(testCase) {
    try {
      const entry = toFlakyEntry(testCase, this.workspaceRoot);
      if (entry) this.entries.push(entry);
    } catch {
      // Observability only: never affect the run.
    }
  }

  onTestRunEnd() {
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
