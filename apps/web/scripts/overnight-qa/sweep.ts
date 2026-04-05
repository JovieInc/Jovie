import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { runCommand } from './command';
import {
  dedupeAndSortIssues,
  parsePlaywrightIssues,
  parseRouteQaIssues,
} from './issues';
import { OVERNIGHT_WEB_ROOT } from './paths';
import type {
  CommandExecutionResult,
  OvernightIssue,
  OvernightSuiteDefinition,
  SuiteRunResult,
  SweepResult,
} from './types';

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

function unique<T>(values: readonly T[]) {
  return [...new Set(values)];
}

export async function runSweepSuites(
  suites: readonly OvernightSuiteDefinition[],
  runDir: string
): Promise<SweepResult> {
  const suiteResults: SuiteRunResult[] = [];
  const allIssues: OvernightIssue[] = [];

  for (const suite of suites) {
    const execution = runCommand(suite.command, {
      cwd: OVERNIGHT_WEB_ROOT,
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
                  OVERNIGHT_WEB_ROOT,
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
