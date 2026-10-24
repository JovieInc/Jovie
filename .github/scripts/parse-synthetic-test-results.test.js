const test = require('node:test');
const assert = require('node:assert/strict');

const {
  classifySyntheticTests,
  parseSyntheticTestResults,
  resolveSyntheticTestStatus,
} = require('./parse-synthetic-test-results');

function buildPlaywrightReport(specs) {
  return {
    suites: [
      {
        specs: specs.map(spec => ({
          title: spec.title,
          tests: [
            {
              status: spec.status,
              results: spec.results ?? [{ status: spec.status }],
            },
          ],
        })),
      },
    ],
  };
}

function createMemoryFileSystem(files) {
  return {
    existsSync(path) {
      return Object.hasOwn(files, path);
    },
    readFileSync(path) {
      return files[path];
    },
  };
}

test('resolveSyntheticTestStatus treats optional skips without unexpected failures as passed', () => {
  const tests = [{}, {}];
  const passed = [{}];
  const skipped = [{}];

  assert.equal(
    resolveSyntheticTestStatus({
      tests,
      missingResults: [],
      passed,
      skipped,
      requiredSkipped: [],
      failed: [],
    }),
    'passed'
  );
});

test('resolveSyntheticTestStatus fails only on unexpected failures', () => {
  const tests = [{}, {}, {}];
  const passed = [{}];
  const skipped = [{}];
  const failed = [{}];

  assert.equal(
    resolveSyntheticTestStatus({
      tests,
      missingResults: [],
      passed,
      skipped,
      requiredSkipped: [],
      failed,
    }),
    'failed'
  );
});

test('classifySyntheticTests distinguishes skipped results from unexpected failures', () => {
  const tests = [
    {
      source: 'onboarding-robot-full',
      spec: { title: 'creates a profile' },
      testCase: { status: 'skipped', results: [{ status: 'skipped' }] },
    },
    {
      source: 'synthetic-golden-path',
      spec: { title: 'loads homepage' },
      testCase: { status: 'expected', results: [{ status: 'passed' }] },
    },
    {
      source: 'synthetic-auth-ui',
      spec: { title: 'shows SSO buttons' },
      testCase: { status: 'unexpected', results: [{ status: 'failed' }] },
    },
  ];

  const classification = classifySyntheticTests(tests);

  assert.equal(classification.skipped.length, 1);
  assert.equal(classification.failed.length, 1);
  assert.equal(classification.passed.length, 1);
});

test('parseSyntheticTestResults fails closed when a required suite is skipped', () => {
  const fileSystem = createMemoryFileSystem({
    'apps/web/test-results/synthetic-auth-ui-results.json': JSON.stringify(
      buildPlaywrightReport([
        { title: 'shows SSO buttons', status: 'expected' },
      ])
    ),
    'apps/web/test-results/synthetic-golden-path-results.json': JSON.stringify(
      buildPlaywrightReport([{ title: 'loads homepage', status: 'expected' }])
    ),
    'apps/web/test-results/onboarding-robot-full-results.json': JSON.stringify(
      buildPlaywrightReport([
        {
          title:
            'creates a profile, verifies dashboard/public profile, and cleans up',
          status: 'skipped',
        },
      ])
    ),
    'apps/web/test-results/public-profile-smoke-results.json': JSON.stringify(
      buildPlaywrightReport([
        { title: 'renders public profile', status: 'expected' },
      ])
    ),
  });

  const result = parseSyntheticTestResults({
    resultFiles: [
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
        required: false,
      },
    ],
    fileSystem,
  });

  assert.equal(result.testStatus, 'failed');
  assert.equal(result.totalTests, 4);
  assert.equal(result.passedTests, 3);
  assert.equal(result.skippedTests, 1);
  assert.deepEqual(result.failedTests, [
    'Skipped tests:',
    'onboarding-robot-full: creates a profile, verifies dashboard/public profile, and cleans up',
  ]);
});

test('parseSyntheticTestResults allows an optional suite to be skipped', () => {
  const fileSystem = createMemoryFileSystem({
    'optional.json': JSON.stringify(
      buildPlaywrightReport([{ title: 'legacy probe', status: 'skipped' }])
    ),
  });

  const result = parseSyntheticTestResults({
    resultFiles: [{ name: 'optional', path: 'optional.json', required: false }],
    fileSystem,
  });

  assert.equal(result.testStatus, 'passed');
  assert.equal(result.skippedTests, 1);
});

test('parseSyntheticTestResults fails when one required report contains zero tests', () => {
  const fileSystem = createMemoryFileSystem({
    'passing.json': JSON.stringify(
      buildPlaywrightReport([{ title: 'healthy probe', status: 'expected' }])
    ),
    'empty-required.json': JSON.stringify({ suites: [] }),
  });

  const result = parseSyntheticTestResults({
    resultFiles: [
      { name: 'passing', path: 'passing.json', required: true },
      {
        name: 'empty-required',
        path: 'empty-required.json',
        required: true,
      },
    ],
    fileSystem,
  });

  assert.equal(result.testStatus, 'error');
  assert.deepEqual(result.failedTests, [
    'empty-required: Required suite reported zero tests (empty-required.json)',
  ]);
});

test('parseSyntheticTestResults fails when any suite reports unexpected failures', () => {
  const fileSystem = createMemoryFileSystem({
    'apps/web/test-results/synthetic-auth-ui-results.json': JSON.stringify(
      buildPlaywrightReport([
        { title: 'shows SSO buttons', status: 'unexpected' },
      ])
    ),
    'apps/web/test-results/synthetic-golden-path-results.json': JSON.stringify(
      buildPlaywrightReport([{ title: 'loads homepage', status: 'expected' }])
    ),
    'apps/web/test-results/onboarding-robot-full-results.json': JSON.stringify(
      buildPlaywrightReport([
        {
          title:
            'creates a profile, verifies dashboard/public profile, and cleans up',
          status: 'skipped',
        },
      ])
    ),
    'apps/web/test-results/public-profile-smoke-results.json': JSON.stringify(
      buildPlaywrightReport([
        { title: 'renders public profile', status: 'expected' },
      ])
    ),
  });

  const result = parseSyntheticTestResults({
    resultFiles: [
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
        name: 'onboarding-robot-full',
        path: 'apps/web/test-results/onboarding-robot-full-results.json',
        required: true,
      },
      {
        name: 'public-profile-smoke',
        path: 'apps/web/test-results/public-profile-smoke-results.json',
        required: true,
      },
    ],
    fileSystem,
  });

  assert.equal(result.testStatus, 'failed');
  assert.deepEqual(result.failedTests, [
    'synthetic-auth-ui: shows SSO buttons',
    'Skipped tests:',
    'onboarding-robot-full: creates a profile, verifies dashboard/public profile, and cleans up',
  ]);
});

test('parseSyntheticTestResults ignores optional legacy OTP results when absent', () => {
  const fileSystem = createMemoryFileSystem({
    'apps/web/test-results/synthetic-auth-ui-results.json': JSON.stringify(
      buildPlaywrightReport([
        { title: 'shows SSO buttons', status: 'expected' },
      ])
    ),
    'apps/web/test-results/synthetic-golden-path-results.json': JSON.stringify(
      buildPlaywrightReport([{ title: 'loads homepage', status: 'expected' }])
    ),
    'apps/web/test-results/onboarding-robot-full-results.json': JSON.stringify(
      buildPlaywrightReport([
        {
          title:
            'creates a profile, verifies dashboard/public profile, and cleans up',
          status: 'expected',
        },
      ])
    ),
    'apps/web/test-results/public-profile-smoke-results.json': JSON.stringify(
      buildPlaywrightReport([
        { title: 'renders public profile', status: 'expected' },
      ])
    ),
  });

  const result = parseSyntheticTestResults({
    resultFiles: [
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
        required: false,
      },
    ],
    fileSystem,
  });

  assert.equal(result.testStatus, 'passed');
  assert.equal(result.totalTests, 4);
});

const ROBOT_SKIP_REASON =
  'synthetic-robot-auth-unavailable: production has no auth bypass for the onboarding robot.';

function passingSyntheticFiles() {
  return {
    'apps/web/test-results/synthetic-auth-ui-results.json': JSON.stringify(
      buildPlaywrightReport([
        { title: 'shows SSO buttons', status: 'expected' },
      ])
    ),
    'apps/web/test-results/synthetic-golden-path-results.json': JSON.stringify(
      buildPlaywrightReport([{ title: 'loads homepage', status: 'expected' }])
    ),
    'apps/web/test-results/public-profile-smoke-results.json': JSON.stringify(
      buildPlaywrightReport([
        { title: 'renders public profile', status: 'expected' },
      ])
    ),
  };
}

const REQUIRED_SYNTHETIC_FILES = [
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
    name: 'onboarding-robot-full',
    path: 'apps/web/test-results/onboarding-robot-full-results.json',
    required: true,
  },
  {
    name: 'public-profile-smoke',
    path: 'apps/web/test-results/public-profile-smoke-results.json',
    required: true,
  },
];

test('parseSyntheticTestResults records a missing production robot as a warning', () => {
  const result = parseSyntheticTestResults({
    resultFiles: REQUIRED_SYNTHETIC_FILES,
    fileSystem: createMemoryFileSystem(passingSyntheticFiles()),
    robotSkipReason: ROBOT_SKIP_REASON,
  });

  assert.equal(result.testStatus, 'passed');
  assert.equal(result.passedTests, 3);
  assert.equal(
    result.testWarnings.some(warning => warning.includes(ROBOT_SKIP_REASON)),
    true
  );
  assert.equal(
    result.failedTests.some(line => line.includes('onboarding-robot-full')),
    false
  );
});

test('parseSyntheticTestResults still fails other suites when the robot skip is logged', () => {
  const files = passingSyntheticFiles();
  files['apps/web/test-results/synthetic-golden-path-results.json'] =
    JSON.stringify(
      buildPlaywrightReport([{ title: 'loads homepage', status: 'unexpected' }])
    );

  const result = parseSyntheticTestResults({
    resultFiles: REQUIRED_SYNTHETIC_FILES,
    fileSystem: createMemoryFileSystem(files),
    robotSkipReason: ROBOT_SKIP_REASON,
  });

  assert.equal(result.testStatus, 'failed');
  assert.deepEqual(result.failedTests, [
    'synthetic-golden-path: loads homepage',
  ]);
  assert.equal(
    result.testWarnings.some(warning => warning.includes(ROBOT_SKIP_REASON)),
    true
  );
});

test('parseSyntheticTestResults keeps an unmarked robot skip as a failure', () => {
  const files = passingSyntheticFiles();
  files['apps/web/test-results/onboarding-robot-full-results.json'] =
    JSON.stringify(
      buildPlaywrightReport([
        {
          title:
            'creates a profile, verifies dashboard/public profile, and cleans up',
          status: 'skipped',
        },
      ])
    );

  const result = parseSyntheticTestResults({
    resultFiles: REQUIRED_SYNTHETIC_FILES,
    fileSystem: createMemoryFileSystem(files),
    robotSkipReason: ROBOT_SKIP_REASON,
  });

  assert.equal(result.testStatus, 'failed');
  assert.equal(
    result.failedTests.includes(
      'onboarding-robot-full: creates a profile, verifies dashboard/public profile, and cleans up'
    ),
    true
  );
});

test('parseSyntheticTestResults records a marked robot skip annotation as a warning', () => {
  const files = passingSyntheticFiles();
  files['apps/web/test-results/onboarding-robot-full-results.json'] =
    JSON.stringify({
      suites: [
        {
          specs: [
            {
              title:
                'creates a profile, verifies dashboard/public profile, and cleans up',
              tests: [
                {
                  status: 'skipped',
                  annotations: [
                    { type: 'skip', description: ROBOT_SKIP_REASON },
                  ],
                  results: [],
                },
              ],
            },
          ],
        },
      ],
    });

  const result = parseSyntheticTestResults({
    resultFiles: REQUIRED_SYNTHETIC_FILES,
    fileSystem: createMemoryFileSystem(files),
    robotSkipReason: ROBOT_SKIP_REASON,
  });

  assert.equal(result.testStatus, 'passed');
  assert.equal(result.skippedTests, 1);
  assert.equal(
    result.testWarnings.some(warning =>
      warning.includes('synthetic-robot-auth-unavailable')
    ),
    true
  );
});

test('parseSyntheticTestResults does not waive a missing robot file without the marker', () => {
  const result = parseSyntheticTestResults({
    resultFiles: REQUIRED_SYNTHETIC_FILES,
    fileSystem: createMemoryFileSystem(passingSyntheticFiles()),
    robotSkipReason: 'robot skipped for another reason',
  });

  assert.equal(result.testStatus, 'error');
  assert.equal(
    result.failedTests.some(line =>
      line.includes('onboarding-robot-full: Test results file not found')
    ),
    true
  );
  assert.equal(result.testWarnings.length, 0);
});

test('parseSyntheticTestResults rejects the old not-implemented robot reason', () => {
  const result = parseSyntheticTestResults({
    resultFiles: REQUIRED_SYNTHETIC_FILES,
    fileSystem: createMemoryFileSystem(passingSyntheticFiles()),
    robotSkipReason:
      'synthetic-robot-not-implemented: no onboarding robot runs against production (JOV-7656).',
  });

  assert.equal(result.testStatus, 'error');
  assert.equal(result.testWarnings.length, 0);
  assert.equal(
    result.failedTests.some(line =>
      line.includes('onboarding-robot-full: Test results file not found')
    ),
    true
  );
});

test('parseSyntheticTestResults keeps a logged OTP skip from failing a required suite', () => {
  const reason =
    'synthetic-otp-unavailable: missing E2E_PROD_OTP_CHECK_TOKEN (Tim-only Cloudflare mailbox secrets)';
  const fileSystem = createMemoryFileSystem({
    'waitlist.json': JSON.stringify({
      suites: [
        {
          specs: [
            {
              title: 'reads the production waitlist preflight receipt',
              tests: [
                {
                  status: 'expected',
                  results: [{ status: 'passed' }],
                },
              ],
            },
            {
              title: 'retains identity and proves waitlist suppression',
              tests: [
                {
                  status: 'skipped',
                  annotations: [{ type: 'skip', description: reason }],
                  results: [],
                },
              ],
            },
          ],
        },
      ],
    }),
  });

  const result = parseSyntheticTestResults({
    resultFiles: [
      {
        name: 'synthetic-production-waitlist',
        path: 'waitlist.json',
        required: true,
      },
    ],
    fileSystem,
    otpSkipReason:
      'Skipping OTP-dependent synthetic steps: missing E2E_PROD_OTP_CHECK_TOKEN (Tim-only Cloudflare mailbox secrets).',
  });

  assert.equal(result.testStatus, 'passed');
  assert.equal(result.passedTests, 1);
  assert.equal(result.skippedTests, 1);
  assert.equal(
    result.testWarnings.some(warning => warning.includes(reason)),
    true
  );
  assert.equal(
    result.testWarnings.some(warning =>
      warning.includes('Skipping OTP-dependent synthetic steps')
    ),
    true
  );
});

test('formatGithubOutput emits a JSON-safe failed_tests_slack line', () => {
  const { formatGithubOutput } = require('./parse-synthetic-test-results');

  const output = formatGithubOutput({
    totalTests: 2,
    passedTests: 0,
    flakyTests: 0,
    skippedTests: 0,
    warningCount: 0,
    testStatus: 'failed',
    failedTests: ['suite: "quoted" title', 'suite: second\nline'],
    testWarnings: [],
  });

  const slackLine = output
    .split('\n')
    .find(line => line.startsWith('failed_tests_slack='));
  assert.ok(slackLine, 'failed_tests_slack output is present');

  const escaped = slackLine.slice('failed_tests_slack='.length);
  // Must not contain raw newlines; must be valid inside a JSON string.
  const parsed = JSON.parse(`"${escaped}"`);
  assert.equal(parsed, 'suite: "quoted" title\nsuite: second\nline');
});
