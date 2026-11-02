import { writeFileSync } from 'node:fs';

// Retain actual addon findings: a green CLI result alone can miss absent hooks.
export default class A11yRunnerReporter {
  records = [];

  onTestCaseResult(testCase) {
    const { reports } = testCase.meta();
    this.records.push({
      name: testCase.name,
      state: testCase.result().state,
      a11y: (reports ?? [])
        .filter(report => report.type === 'a11y')
        .map(report => ({
          status: report.status,
          violations: report.result?.violations?.map(item => item.id) ?? [],
          incomplete: report.result?.incomplete?.map(item => item.id) ?? [],
          error: report.result?.error?.message ?? null,
        })),
    });
  }

  onTestRunEnd(_testModules, unhandledErrors, reason) {
    writeFileSync(
      process.env.JOVIE_STORYBOOK_A11Y_REPORT,
      `${JSON.stringify(
        {
          records: this.records,
          unhandledErrors: unhandledErrors.map(error => error.message),
          reason,
        },
        null,
        2
      )}\n`
    );
  }
}
