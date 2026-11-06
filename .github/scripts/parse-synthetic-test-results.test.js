const test = require('node:test');
const assert = require('node:assert/strict');

const {
  classifySyntheticTests,
  formatGithubOutput,
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
              ...(spec.annotation
                ? {
                    annotations: [
                      { type: 'skip', description: spec.annotation },
                    ],
                    results: [],
                  }
                : { results: spec.results ?? [{ status: spec.status }] }),
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

const OTP_SKIP_ANNOTATION =
  'synthetic-otp-unavailable: missing E2E_PROD_OTP_CHECK_TOKEN (Tim-only Cloudflare mailbox secrets)';
const OTP_RESOLVER_REASON =
  'Skipping OTP-dependent synthetic steps: missing E2E_PROD_OTP_CHECK_TOKEN (Tim-only Cloudflare mailbox secrets).';
const OTP_DOPPLER_REASON =
  'synthetic-otp-unavailable: could not read E2E_PROD_OTP_CHECK_TOKEN from Doppler jovie-web/prd after 3 attempts (exit-7) — Doppler resolution failure, not a verified missing secret. Re-run the workflow.';
const ROBOT_SKIP_REASON =
  'synthetic-robot-auth-unavailable: production has no auth bypass for the onboarding robot.';
const WAITLIST_RESULT_FILES = [
  {
    name: 'synthetic-production-waitlist',
    path: 'waitlist.json',
    required: true,
  },
];

// Waitlist canary report: a passing preflight leg plus one more leg.
function waitlistReport(extraLegs) {
  return {
    fileSystem: createMemoryFileSystem({
      'waitlist.json': JSON.stringify(
        buildPlaywrightReport([
          {
            title: 'reads the production waitlist preflight receipt',
            status: 'expected',
          },
          ...extraLegs,
        ])
      ),
    }),
  };
}

const OTP_SKIPPED_LEG = {
  title: 'retains identity and proves waitlist suppression',
  status: 'skipped',
  annotation: OTP_SKIP_ANNOTATION,
};

const ROBOT_SKIPPED_TITLE =
  'creates a profile, verifies dashboard/public profile, and cleans up';

function passingSyntheticFiles() {
  const report = JSON.stringify(
    buildPlaywrightReport([{ title: 'shows SSO buttons', status: 'expected' }])
  );
  return {
    'apps/web/test-results/synthetic-auth-ui-results.json': report,
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
  'synthetic-auth-ui',
  'synthetic-golden-path',
  'onboarding-robot-full',
  'public-profile-smoke',
].map(name => ({
  name,
  path: `apps/web/test-results/${name}-results.json`,
  required: true,
}));

test('resolveSyntheticTestStatus treats optional skips without unexpected failures as passed', () => {
  assert.equal(
    resolveSyntheticTestStatus({
      tests: [{}, {}],
      missingResults: [],
      passed: [{}],
      skipped: [{}],
      requiredSkipped: [],
      failed: [],
    }),
    'passed'
  );
});

test('resolveSyntheticTestStatus fails only on unexpected failures', () => {
  assert.equal(
    resolveSyntheticTestStatus({
      tests: [{}, {}, {}],
      missingResults: [],
      passed: [{}],
      skipped: [{}],
      requiredSkipped: [],
      failed: [{}],
    }),
    'failed'
  );
});

test('classifySyntheticTests distinguishes skipped results from unexpected failures', () => {
  const classification = classifySyntheticTests([
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
  ]);

  assert.equal(classification.skipped.length, 1);
  assert.equal(classification.failed.length, 1);
  assert.equal(classification.passed.length, 1);
});

test('parseSyntheticTestResults fails closed when a required suite is skipped', () => {
  const files = passingSyntheticFiles();
  files['apps/web/test-results/synthetic-golden-path-results.json'] =
    files['apps/web/test-results/synthetic-auth-ui-results.json'];
  files['apps/web/test-results/onboarding-robot-full-results.json'] =
    JSON.stringify(
      buildPlaywrightReport([{ title: ROBOT_SKIPPED_TITLE, status: 'skipped' }])
    );
  files['apps/web/test-results/public-profile-smoke-results.json'] =
    files['apps/web/test-results/synthetic-auth-ui-results.json'];

  const result = parseSyntheticTestResults({
    resultFiles: REQUIRED_SYNTHETIC_FILES,
    fileSystem: createMemoryFileSystem(files),
  });

  assert.equal(result.testStatus, 'failed');
  assert.equal(result.totalTests, 4);
  assert.equal(result.passedTests, 3);
  assert.equal(result.skippedTests, 1);
  assert.deepEqual(result.failedTests, [
    'Skipped tests:',
    `onboarding-robot-full: ${ROBOT_SKIPPED_TITLE}`,
  ]);
});

test('parseSyntheticTestResults allows an optional suite to be skipped', () => {
  const result = parseSyntheticTestResults({
    resultFiles: [{ name: 'optional', path: 'optional.json', required: false }],
    fileSystem: createMemoryFileSystem({
      'optional.json': JSON.stringify(
        buildPlaywrightReport([{ title: 'legacy probe', status: 'skipped' }])
      ),
    }),
  });

  assert.equal(result.testStatus, 'passed');
  assert.equal(result.skippedTests, 1);
});

test('parseSyntheticTestResults fails when one required report contains zero tests', () => {
  const result = parseSyntheticTestResults({
    resultFiles: [
      { name: 'passing', path: 'passing.json', required: true },
      { name: 'empty-required', path: 'empty-required.json', required: true },
    ],
    fileSystem: createMemoryFileSystem({
      'passing.json': JSON.stringify(
        buildPlaywrightReport([{ title: 'healthy probe', status: 'expected' }])
      ),
      'empty-required.json': JSON.stringify({ suites: [] }),
    }),
  });

  assert.equal(result.testStatus, 'error');
  assert.deepEqual(result.failedTests, [
    'empty-required: Required suite reported zero tests (empty-required.json)',
  ]);
});

test('parseSyntheticTestResults fails when any suite reports unexpected failures', () => {
  const files = passingSyntheticFiles();
  files['apps/web/test-results/synthetic-auth-ui-results.json'] =
    JSON.stringify(
      buildPlaywrightReport([
        { title: 'shows SSO buttons', status: 'unexpected' },
      ])
    );
  files['apps/web/test-results/onboarding-robot-full-results.json'] =
    JSON.stringify(
      buildPlaywrightReport([{ title: ROBOT_SKIPPED_TITLE, status: 'skipped' }])
    );
  files['apps/web/test-results/public-profile-smoke-results.json'] = files[
    'apps/web/test-results/synthetic-auth-ui-results.json'
  ].replace('unexpected', 'expected');

  const result = parseSyntheticTestResults({
    resultFiles: REQUIRED_SYNTHETIC_FILES,
    fileSystem: createMemoryFileSystem(files),
  });

  assert.equal(result.testStatus, 'failed');
  assert.deepEqual(result.failedTests, [
    'synthetic-auth-ui: shows SSO buttons',
    'Skipped tests:',
    `onboarding-robot-full: ${ROBOT_SKIPPED_TITLE}`,
  ]);
});

test('parseSyntheticTestResults ignores optional legacy OTP results when absent', () => {
  const files = passingSyntheticFiles();
  files['apps/web/test-results/onboarding-robot-full-results.json'] =
    JSON.stringify(
      buildPlaywrightReport([
        { title: ROBOT_SKIPPED_TITLE, status: 'expected' },
      ])
    );
  files['apps/web/test-results/public-profile-smoke-results.json'] =
    files['apps/web/test-results/synthetic-auth-ui-results.json'];

  const result = parseSyntheticTestResults({
    resultFiles: [
      ...REQUIRED_SYNTHETIC_FILES,
      {
        name: 'synthetic-legacy-otp',
        path: 'apps/web/test-results/synthetic-legacy-otp-results.json',
        required: false,
      },
    ],
    fileSystem: createMemoryFileSystem(files),
  });

  assert.equal(result.testStatus, 'passed');
  assert.equal(result.totalTests, 4);
});

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
      buildPlaywrightReport([{ title: ROBOT_SKIPPED_TITLE, status: 'skipped' }])
    );
  files['apps/web/test-results/public-profile-smoke-results.json'] =
    files['apps/web/test-results/synthetic-auth-ui-results.json'];

  const result = parseSyntheticTestResults({
    resultFiles: REQUIRED_SYNTHETIC_FILES,
    fileSystem: createMemoryFileSystem(files),
    robotSkipReason: ROBOT_SKIP_REASON,
  });

  assert.equal(result.testStatus, 'failed');
  assert.equal(
    result.failedTests.includes(
      `onboarding-robot-full: ${ROBOT_SKIPPED_TITLE}`
    ),
    true
  );
});

test('parseSyntheticTestResults records a marked robot skip annotation as a warning', () => {
  const files = passingSyntheticFiles();
  files['apps/web/test-results/onboarding-robot-full-results.json'] =
    JSON.stringify(
      buildPlaywrightReport([
        {
          title: ROBOT_SKIPPED_TITLE,
          status: 'skipped',
          annotation: ROBOT_SKIP_REASON,
        },
      ])
    );
  files['apps/web/test-results/public-profile-smoke-results.json'] =
    files['apps/web/test-results/synthetic-auth-ui-results.json'];

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
  const result = parseSyntheticTestResults({
    resultFiles: [
      { name: 'synthetic-golden-path', path: 'waitlist.json', required: true },
    ],
    ...waitlistReport([OTP_SKIPPED_LEG]),
    otpSkipReason: OTP_RESOLVER_REASON,
  });

  assert.equal(result.testStatus, 'passed');
  assert.equal(result.passedTests, 1);
  assert.equal(result.skippedTests, 1);
  assert.equal(
    result.testWarnings.some(warning => warning.includes(OTP_SKIP_ANNOTATION)),
    true
  );
  assert.equal(
    result.testWarnings.some(warning =>
      warning.includes('Skipping OTP-dependent synthetic steps')
    ),
    true
  );
});

test('parseSyntheticTestResults treats a resolver-verified missing-OTP waitlist skip as missing-config, not a failure (JOV-7656)', () => {
  const result = parseSyntheticTestResults({
    resultFiles: WAITLIST_RESULT_FILES,
    ...waitlistReport([OTP_SKIPPED_LEG]),
    otpSkipReason: OTP_RESOLVER_REASON,
  });

  // Same class as the robot skip: Tim-only secrets verified absent is a named
  // missing-config state, reported visibly, not a red run.
  assert.equal(result.testStatus, 'passed');
  assert.equal(result.passedTests, 1);
  assert.equal(result.skippedTests, 1);
  assert.deepEqual(result.failedTests, [
    'Skipped tests:',
    `synthetic-production-waitlist: retains identity and proves waitlist suppression (skip reason: ${OTP_SKIP_ANNOTATION})`,
  ]);
  assert.equal(
    result.testWarnings.some(warning =>
      warning.includes(
        'synthetic-production-waitlist: retains identity and proves waitlist suppression'
      )
    ),
    true
  );
  assert.equal(
    result.testWarnings.some(warning =>
      warning.includes('synthetic-otp-unavailable')
    ),
    true
  );
  assert.equal(
    result.testWarnings.some(warning =>
      warning.includes('Skipping OTP-dependent synthetic steps')
    ),
    true
  );
});

test('parseSyntheticTestResults keeps a waitlist OTP-marked skip red without resolver corroboration (JOV-7656)', () => {
  const result = parseSyntheticTestResults({
    resultFiles: WAITLIST_RESULT_FILES,
    ...waitlistReport([OTP_SKIPPED_LEG]),
    otpSkipReason: '',
  });

  // The marker alone is not a pass: the resolver must verify the secrets are
  // absent. With no corroboration the skip stays loud.
  assert.equal(result.testStatus, 'failed');
  assert.ok(
    result.failedTests.includes(
      `synthetic-production-waitlist: retains identity and proves waitlist suppression (skip reason: ${OTP_SKIP_ANNOTATION})`
    ),
    `failedTests should carry the skip reason inline, got: ${JSON.stringify(result.failedTests)}`
  );
});

test('parseSyntheticTestResults keeps a real waitlist failure red even when another leg skips for missing OTP config (JOV-7656)', () => {
  const result = parseSyntheticTestResults({
    resultFiles: WAITLIST_RESULT_FILES,
    ...waitlistReport([
      {
        title: 'reads the production waitlist preflight receipt',
        status: 'unexpected',
      },
      OTP_SKIPPED_LEG,
    ]),
    otpSkipReason: OTP_RESOLVER_REASON,
  });

  assert.equal(result.testStatus, 'failed');
  assert.deepEqual(result.failedTests, [
    'synthetic-production-waitlist: reads the production waitlist preflight receipt',
    'Skipped tests:',
    `synthetic-production-waitlist: retains identity and proves waitlist suppression (skip reason: ${OTP_SKIP_ANNOTATION})`,
  ]);
});

test('a Doppler read failure is reported as the skip cause, not as missing secrets (JOV-6813)', () => {
  const result = parseSyntheticTestResults({
    resultFiles: WAITLIST_RESULT_FILES,
    ...waitlistReport([OTP_SKIPPED_LEG]),
    otpSkipReason: OTP_DOPPLER_REASON,
  });

  assert.equal(result.testStatus, 'failed');
  assert.ok(
    result.failedTests.some(line =>
      line.startsWith(
        'Skip cause: synthetic-otp-unavailable: could not read E2E_PROD_OTP_CHECK_TOKEN'
      )
    ),
    'the resolution-failure cause must reach failed_tests'
  );
  assert.ok(
    result.failedTests.every(
      line =>
        !line.startsWith(
          'Skip cause: Skipping OTP-dependent synthetic steps: missing'
        )
    ),
    'the misleading "missing secrets" wording must not be the reported cause'
  );
  // JOV-6813: a failing skip still names its cause inline.
  assert.ok(
    result.failedTests.includes(
      `synthetic-production-waitlist: retains identity and proves waitlist suppression (skip reason: ${OTP_SKIP_ANNOTATION})`
    ),
    `failedTests should carry the skip reason inline, got: ${JSON.stringify(result.failedTests)}`
  );
});

test('an unrelated required skip is not attributed to OTP configuration', () => {
  const result = parseSyntheticTestResults({
    resultFiles: WAITLIST_RESULT_FILES,
    fileSystem: createMemoryFileSystem({
      'waitlist.json': JSON.stringify(
        buildPlaywrightReport([
          { title: 'other prerequisite', status: 'skipped' },
        ])
      ),
    }),
    otpSkipReason: 'synthetic-otp-unavailable: unrelated OTP read failure',
  });
  assert.equal(result.testStatus, 'failed');
  assert.ok(
    result.failedTests.includes(
      'synthetic-production-waitlist: other prerequisite'
    )
  );
  assert.equal(
    result.failedTests.some(line => line.startsWith('Skip cause:')),
    false
  );
});

test('OTP cause is retained when an OTP marker follows another annotation', () => {
  const result = parseSyntheticTestResults({
    resultFiles: WAITLIST_RESULT_FILES,
    fileSystem: createMemoryFileSystem({
      'waitlist.json': JSON.stringify({
        suites: [
          {
            specs: [
              {
                title: 'mixed reasons',
                tests: [
                  {
                    status: 'skipped',
                    annotations: [
                      { description: 'synthetic-robot-auth-unavailable' },
                      { description: 'synthetic-otp-unavailable' },
                    ],
                    results: [],
                  },
                ],
              },
            ],
          },
        ],
      }),
    }),
    otpSkipReason: 'authoritative OTP cause',
  });
  assert.equal(result.testStatus, 'failed');
  assert.ok(result.failedTests.includes('Skip cause: authoritative OTP cause'));
});

test('formatGithubOutput emits a JSON-safe failed_tests_slack line', () => {
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
