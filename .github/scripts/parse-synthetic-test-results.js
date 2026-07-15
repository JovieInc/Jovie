const fs = require('node:fs');

const DEFAULT_RESULT_FILES = (
  legacyCanaryEnabled,
  chatCanaryEnabled = false
) => [
  {
    name: 'synthetic-auth-ui',
    path: 'apps/web/test-results/synthetic-auth-ui-results.json',
    required: true,
  },
  {
    name: 'synthetic-golden-path',
    path: 'apps/web/test-results/synthetic-golden-path-results.json',
    required: true,
  },
  {
    name: 'synthetic-better-auth-account',
    path: 'apps/web/test-results/synthetic-better-auth-account-results.json',
    required: true,
  },
  {
    name: 'onboarding-robot-full',
    path: 'apps/web/test-results/onboarding-robot-full-results.json',
    required: true,
  },
  {
    name: 'public-profile-smoke',
    path: 'apps/web/test-results/public-profile-smoke-results.json',
    required: true,
  },
  {
    name: 'synthetic-legacy-otp',
    path: 'apps/web/test-results/synthetic-legacy-otp-results.json',
    required: legacyCanaryEnabled,
  },
  {
    name: 'synthetic-chat-turn',
    path: 'apps/web/test-results/synthetic-chat-turn-results.json',
    required: chatCanaryEnabled,
  },
];

function collectSpecs(suites = [], source, required = true) {
  const specs = [];

  for (const suite of suites) {
    specs.push(
      ...(suite.specs ?? []).map(spec => ({ source, required, spec }))
    );
    specs.push(...collectSpecs(suite.suites ?? [], source, required));
  }

  return specs;
}

function classifySyntheticTests(tests) {
  const skipped = tests.filter(
    ({ testCase }) =>
      testCase.status === 'skipped' ||
      (testCase.results ?? []).some(result => result.status === 'skipped')
  );
  const requiredSkipped = skipped.filter(({ required }) => required);
  const warnings = tests.flatMap(({ source, spec, testCase }) =>
    (testCase.results ?? []).flatMap(result =>
      [...(result.stdout ?? []), ...(result.stderr ?? [])]
        .map(entry => entry.text ?? '')
        .filter(text => text.includes('[Synthetic][warning]'))
        .map(text => `${source}: ${spec.title}: ${text.trim()}`)
    )
  );
  const flaky = tests.filter(({ testCase }) => testCase.status === 'flaky');
  const failed = tests.filter(
    ({ testCase }) => testCase.status === 'unexpected'
  );
  const passed = tests.filter(
    ({ testCase }) =>
      ['expected', 'flaky'].includes(testCase.status) &&
      !(testCase.results ?? []).some(result => result.status === 'skipped')
  );

  return { skipped, requiredSkipped, warnings, flaky, failed, passed };
}

function resolveSyntheticTestStatus({
  tests,
  missingResults,
  passed,
  skipped,
  requiredSkipped = [],
  failed,
}) {
  if (missingResults.length > 0 || tests.length === 0) {
    return 'error';
  }

  if (failed.length > 0 || requiredSkipped.length > 0) {
    return 'failed';
  }

  if (passed.length + skipped.length === tests.length) {
    return 'passed';
  }

  return 'error';
}

function loadSyntheticResultSpecs(resultFiles, fileSystem = fs) {
  const specs = [];
  const missingResults = [];

  for (const resultFile of resultFiles) {
    if (!fileSystem.existsSync(resultFile.path)) {
      if (resultFile.required !== false) {
        missingResults.push(
          `${resultFile.name}: Test results file not found (${resultFile.path})`
        );
      }
      continue;
    }

    try {
      const results = JSON.parse(
        fileSystem.readFileSync(resultFile.path, 'utf8')
      );
      const fileSpecs = collectSpecs(
        results.suites ?? [],
        resultFile.name,
        resultFile.required !== false
      );
      const fileTestCount = fileSpecs.reduce(
        (count, { spec }) => count + (spec.tests ?? []).length,
        0
      );
      if (resultFile.required !== false && fileTestCount === 0) {
        missingResults.push(
          `${resultFile.name}: Required suite reported zero tests (${resultFile.path})`
        );
        continue;
      }
      specs.push(...fileSpecs);
    } catch (error) {
      missingResults.push(
        `${resultFile.name}: Failed to parse ${resultFile.path}: ${error.message}`
      );
    }
  }

  return { specs, missingResults };
}

function parseSyntheticTestResults({ resultFiles, fileSystem = fs } = {}) {
  const resolvedResultFiles =
    resultFiles ??
    DEFAULT_RESULT_FILES(process.env.LEGACY_CANARY_ENABLED === '1');

  const { specs, missingResults } = loadSyntheticResultSpecs(
    resolvedResultFiles,
    fileSystem
  );
  const tests = specs.flatMap(({ source, required, spec }) =>
    (spec.tests ?? []).map(testCase => ({
      source,
      required,
      spec,
      testCase,
    }))
  );
  const { skipped, requiredSkipped, warnings, flaky, failed, passed } =
    classifySyntheticTests(tests);
  const testStatus = resolveSyntheticTestStatus({
    tests,
    missingResults,
    passed,
    skipped,
    requiredSkipped,
    failed,
  });

  const failedTests = [
    ...missingResults,
    ...failed.map(({ source, spec }) => `${source}: ${spec.title}`),
    ...(skipped.length > 0
      ? [
          'Skipped tests:',
          ...skipped.map(({ source, spec }) => `${source}: ${spec.title}`),
        ]
      : []),
  ];

  return {
    totalTests: tests.length,
    passedTests: passed.length,
    flakyTests: flaky.length,
    skippedTests: skipped.length,
    warningCount: warnings.length,
    testStatus,
    failedTests,
    testWarnings: warnings,
  };
}

function formatGithubOutput(result) {
  const lines = [
    `total_tests=${result.totalTests}`,
    `passed_tests=${result.passedTests}`,
    `flaky_tests=${result.flakyTests}`,
    `skipped_tests=${result.skippedTests}`,
    `warning_count=${result.warningCount}`,
    'failed_tests<<EOF',
    ...result.failedTests,
    'EOF',
    'test_warnings<<EOF',
    ...result.testWarnings,
    'EOF',
    `test_status=${result.testStatus}`,
  ];

  return `${lines.join('\n')}\n`;
}

module.exports = {
  DEFAULT_RESULT_FILES,
  classifySyntheticTests,
  collectSpecs,
  formatGithubOutput,
  loadSyntheticResultSpecs,
  parseSyntheticTestResults,
  resolveSyntheticTestStatus,
};
