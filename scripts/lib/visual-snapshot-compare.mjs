/**
 * Fail-closed visual snapshot compare (JOV-5459).
 *
 * Compare mode treats a missing baseline / ENOENT as FAIL. Refresh mode is the
 * only path allowed to pass --update-snapshots and self-heal missing files.
 * Advisory success is never a valid compare outcome.
 *
 * JOV-5960: the compare job runs on every merge group and on source PRs that
 * touch the homepage surface. Source PR Ready must require it there — a
 * skipped compare is not green on a homepage PR.
 */

export const VISUAL_COMPARE_MODE = 'compare';
export const VISUAL_REFRESH_MODE = 'refresh';

/**
 * Path Changes output that selects the compare job on source PRs. Any change
 * to the mounted homepage surface, its stylesheet, its locked copy, the
 * homepage visual spec, or its committed baselines selects it (JOV-5960), so a
 * skipped compare can never read as green on a homepage PR.
 */
export const HOMEPAGE_VISUAL_SELECTION_OUTPUT =
  'needs.ci-path-changes.outputs.run_homepage_visual';

export const VISUAL_SNAPSHOT_SPECS = Object.freeze([
  'apps/web/tests/e2e/visual-regression.spec.ts',
  'apps/web/tests/e2e/auth-visual.spec.ts',
  'apps/web/tests/e2e/chat-visual.spec.ts',
  'apps/web/tests/e2e/admin-visual-regression.spec.ts',
  'apps/web/tests/e2e/storybook-elevation.spec.ts',
]);

const STATIC_SCREENSHOT_NAME = /toHaveScreenshot\(\s*(['"`])([^$'"`\n]+)\1/g;
const MISSING_SNAPSHOT_MESSAGE =
  /A snapshot doesn't exist|snapshot(?: file)? does not exist|no snapshot|ENOENT/i;

/**
 * @typedef {{
 *   mode?: string,
 *   updateSnapshots?: boolean,
 *   error?: any,
 *   missingBaselinePaths?: readonly string[],
 *   advisory?: boolean,
 * }} VisualSnapshotOutcomeInput
 *
 * @typedef {{
 *   ok: boolean,
 *   status: string,
 *   reason: string,
 *   missingBaselinePaths?: readonly string[],
 *   workflowIssues?: readonly string[],
 * }} VisualSnapshotOutcome
 *
 * @typedef {{
 *   repoRoot?: string,
 *   existsSync?: any,
 *   readFileSync?: any,
 *   specs?: readonly string[],
 * }} VisualSnapshotInventoryInput
 *
 * @typedef {{
 *   visualRegressionYaml?: string,
 *   ciYaml?: string,
 * }} VisualCompareWorkflowContractInput
 *
 * @typedef {{
 *   repoRoot?: string,
 *   mode?: string,
 *   existsSync?: any,
 *   readFileSync?: any,
 *   visualRegressionYaml?: string,
 *   ciYaml?: string,
 * }} VisualSnapshotCompareInput
 */

/**
 * @param {any} [error]
 * @returns {boolean}
 */
export function isMissingBaselineSignal(error = {}) {
  const code = error?.code ?? error?.errnoException?.code;
  const message = String(error?.message ?? error ?? '');
  return code === 'ENOENT' || MISSING_SNAPSHOT_MESSAGE.test(message);
}

/**
 * @param {VisualSnapshotOutcomeInput} [input]
 * @returns {VisualSnapshotOutcome}
 */
export function classifyVisualSnapshotOutcome({
  mode,
  updateSnapshots = false,
  error = null,
  missingBaselinePaths = [],
  advisory = false,
} = {}) {
  if (mode !== VISUAL_COMPARE_MODE && mode !== VISUAL_REFRESH_MODE) {
    return {
      ok: false,
      status: 'fail',
      reason: 'unknown-mode',
      missingBaselinePaths,
    };
  }

  if (mode === VISUAL_COMPARE_MODE && updateSnapshots) {
    return {
      ok: false,
      status: 'fail',
      reason: 'compare-must-not-update-snapshots',
      missingBaselinePaths,
    };
  }

  if (mode === VISUAL_COMPARE_MODE && advisory) {
    return {
      ok: false,
      status: 'fail',
      reason: 'compare-must-not-be-advisory',
      missingBaselinePaths,
    };
  }

  const missing =
    (Array.isArray(missingBaselinePaths) && missingBaselinePaths.length > 0) ||
    isMissingBaselineSignal(error ?? {});

  if (missing) {
    if (mode === VISUAL_REFRESH_MODE && updateSnapshots) {
      return {
        ok: true,
        status: 'refresh-update',
        reason: 'refresh-self-heal',
        missingBaselinePaths,
      };
    }
    return {
      ok: false,
      status: 'fail',
      reason: 'missing-baseline',
      missingBaselinePaths,
    };
  }

  return {
    ok: true,
    status: 'pass',
    reason: 'matched',
    missingBaselinePaths: [],
  };
}

export function parseStaticScreenshotNames(source) {
  const names = [];
  STATIC_SCREENSHOT_NAME.lastIndex = 0;
  let match = STATIC_SCREENSHOT_NAME.exec(source);
  while (match) {
    names.push(match[2]);
    match = STATIC_SCREENSHOT_NAME.exec(source);
  }
  return names;
}

export function expectedSnapshotDir(specPath) {
  const fileName = specPath.slice(specPath.lastIndexOf('/') + 1);
  const parent = specPath.slice(0, specPath.lastIndexOf('/'));
  return `${parent}/__snapshots__/${fileName}`;
}

export function extractJobBlock(workflow, jobKey) {
  const lines = String(workflow ?? '').split('\n');
  const start = lines.findIndex(line => line === `  ${jobKey}:`);
  if (start < 0) return '';
  const block = [];
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (index > start && /^  [a-zA-Z0-9_-]+:/.test(line)) break;
    block.push(line);
  }
  return block.join('\n');
}

/**
 * @param {VisualSnapshotInventoryInput} [input]
 * @returns {string[]}
 */
export function inventoryMissingBaselines({
  repoRoot,
  existsSync,
  readFileSync,
  specs = VISUAL_SNAPSHOT_SPECS,
} = {}) {
  const missing = [];
  for (const spec of specs) {
    const specAbs = `${repoRoot}/${spec}`;
    if (!existsSync(specAbs)) {
      missing.push(spec);
      continue;
    }
    const source = readFileSync(specAbs, 'utf8');
    if (!source.includes('toHaveScreenshot')) continue;
    const snapshotDir = expectedSnapshotDir(spec);
    if (!existsSync(`${repoRoot}/${snapshotDir}`)) {
      missing.push(snapshotDir);
      continue;
    }
    for (const name of parseStaticScreenshotNames(source)) {
      const relativePath = `${snapshotDir}/${name}`;
      if (!existsSync(`${repoRoot}/${relativePath}`))
        missing.push(relativePath);
    }
  }
  return missing;
}

/**
 * Job ids of the split visual compare lane: one shared build plus three
 * parallel rendered suites (merge-time move 2). The build job keeps the
 * historical id/name so every external consumer of `ci-visual-snapshot-compare`
 * keeps pointing at the lane root.
 */
export const VISUAL_COMPARE_BUILD_JOB = 'ci-visual-snapshot-compare';
export const VISUAL_HOMEPAGE_COMPARE_JOB = 'ci-visual-snapshot-homepage';
export const VISUAL_MARKETING_DOM_JOB = 'ci-visual-marketing-dom';
export const VISUAL_MARKETING_ROUTES_JOB = 'ci-visual-marketing-routes';

/** Artifact name prefix that carries the shared build to every suite job. */
export const VISUAL_COMPARE_BUILD_ARTIFACT = 'visual-compare-build-';

/**
 * @param {VisualCompareWorkflowContractInput} [input]
 * @returns {string[]}
 */
export function assertVisualCompareWorkflowContract({
  visualRegressionYaml = '',
  ciYaml = '',
} = {}) {
  const issues = [];
  if (/^\s*pull_request:/m.test(visualRegressionYaml)) {
    issues.push('visual-regression.yml must not run on pull_request');
  }
  if (/^\s*merge_group:/m.test(visualRegressionYaml)) {
    issues.push(
      'visual-regression.yml must stay refresh-only (merge groups do not provision Neon)'
    );
  }
  if (!/REFRESH_MODE:\s*'true'/.test(visualRegressionYaml)) {
    issues.push('refresh job must set REFRESH_MODE true');
  }
  if (!visualRegressionYaml.includes('--update-snapshots')) {
    issues.push('refresh job must pass --update-snapshots');
  }
  if (!visualRegressionYaml.includes('if [ "$REFRESH_MODE" = "true" ]')) {
    issues.push('--update-snapshots must be gated on REFRESH_MODE');
  }

  /** Every job in the split lane shares the same fail-closed rules. */
  const forEveryVisualJob = (jobId, label) => {
    const block = extractJobBlock(ciYaml, jobId);
    if (!block) {
      issues.push(`ci.yml must define ${jobId}`);
      return null;
    }
    if (
      /^\s+- run:.*--update-snapshots/m.test(block) ||
      block.includes('UPDATE_FLAG="--update-snapshots"')
    ) {
      issues.push(`${label} must not pass --update-snapshots`);
    }
    if (block.includes('continue-on-error')) {
      issues.push(`${label} must not be advisory continue-on-error`);
    }
    if (block.includes('neon-create-branch')) {
      issues.push(`${label} must not provision Neon`);
    }
    return block;
  };

  const buildJob = forEveryVisualJob(VISUAL_COMPARE_BUILD_JOB, 'compare job');
  if (buildJob) {
    if (!buildJob.includes("github.event_name == 'merge_group'")) {
      issues.push('compare job must run on merge_group');
    }
    if (!buildJob.includes(`${HOMEPAGE_VISUAL_SELECTION_OUTPUT} == 'true'`)) {
      issues.push(
        'compare job must run on homepage pull_request paths (run_homepage_visual)'
      );
    }
    const buildContract = [
      './.github/actions/setup-node-pnpm',
      'pnpm turbo build --filter=@jovie/web',
      // The handoff ships only what the standalone server needs; the restored
      // Turbopack cache is build-only compiler state and must not ride along.
      'tar -cf "${{ runner.temp }}/visual-compare-build.tar" --exclude=\'.next/cache\'',
      'actions/upload-artifact@',
      VISUAL_COMPARE_BUILD_ARTIFACT,
    ];
    if (buildContract.some(fragment => !buildJob.includes(fragment))) {
      issues.push(
        'compare job must build once and publish the shared visual compare build artifact'
      );
    }
  }

  const homepageJob = forEveryVisualJob(
    VISUAL_HOMEPAGE_COMPARE_JOB,
    'homepage visual compare suite'
  );
  if (homepageJob) {
    if (
      !homepageJob.includes(`${HOMEPAGE_VISUAL_SELECTION_OUTPUT} == 'true'`)
    ) {
      issues.push(
        'homepage visual compare suite must run on homepage pull_request paths (run_homepage_visual)'
      );
    }
    const renderedHomepageContract = [
      './.github/actions/setup-node-pnpm',
      './.github/actions/setup-playwright',
      'actions/download-artifact@',
      VISUAL_COMPARE_BUILD_ARTIFACT,
      '.github/scripts/guard-playwright-artifacts.mjs',
      'playwright test tests/e2e/visual-regression.spec.ts',
      '--project=chromium',
      '--grep homepage',
    ];
    if (
      renderedHomepageContract.some(fragment => !homepageJob.includes(fragment))
    ) {
      issues.push(
        'homepage visual compare must render and compare the Playwright homepage snapshots'
      );
    }
  }

  const marketingDomJob = forEveryVisualJob(
    VISUAL_MARKETING_DOM_JOB,
    'marketing DOM certification suite'
  );
  if (marketingDomJob) {
    const marketingDomContract = [
      'actions/download-artifact@',
      VISUAL_COMPARE_BUILD_ARTIFACT,
      '.github/scripts/guard-playwright-artifacts.mjs',
      'tests/product-screenshots/route-dom-certification.spec.ts',
      '--workers=1',
    ];
    if (
      marketingDomContract.some(fragment => !marketingDomJob.includes(fragment))
    ) {
      issues.push(
        'marketing DOM certification suite must run the route DOM certification spec on the shared build'
      );
    }
  }

  const marketingRoutesJob = forEveryVisualJob(
    VISUAL_MARKETING_ROUTES_JOB,
    'marketing route capture suite'
  );
  if (marketingRoutesJob) {
    const marketingRoutesContract = [
      'actions/download-artifact@',
      VISUAL_COMPARE_BUILD_ARTIFACT,
      '.github/scripts/guard-playwright-artifacts.mjs',
      'tests/product-screenshots/marketing-routes.spec.ts',
      '--workers=4',
    ];
    if (
      marketingRoutesContract.some(
        fragment => !marketingRoutesJob.includes(fragment)
      )
    ) {
      issues.push(
        'marketing route capture suite must run the exact marketing route spec on the shared build'
      );
    }
  }

  const mergeReady = extractJobBlock(ciYaml, 'ci-merge-group-ready');
  const mergeReadyRequiredJobs = [
    VISUAL_COMPARE_BUILD_JOB,
    VISUAL_HOMEPAGE_COMPARE_JOB,
    VISUAL_MARKETING_DOM_JOB,
    VISUAL_MARKETING_ROUTES_JOB,
  ];
  for (const jobId of mergeReadyRequiredJobs) {
    if (!mergeReady.includes(jobId)) {
      issues.push('merge-group PR Ready must require visual snapshot compare');
      break;
    }
  }
  // Listing the needs — or merely assigning each suite's result to a shell
  // variable — is not enough: the merge-group aggregate must route every
  // selected suite's result through the enforcing selected-gate loop, or a
  // failing/skipped suite rides through on the shared build's success.
  const mergeReadySuiteValidations = [
    [
      'needs.ci-visual-snapshot-homepage.result',
      '"Homepage Visual Compare:$RUN_HOMEPAGE_VISUAL:$VISUAL_HOMEPAGE_RESULT"',
    ],
    [
      'needs.ci-visual-marketing-dom.result',
      '"Marketing DOM Certification:$RUN_MARKETING_DOM:$VISUAL_MARKETING_DOM_RESULT"',
    ],
    [
      'needs.ci-visual-marketing-routes.result',
      '"Marketing Route Capture:$RUN_MARKETING_DOM:$VISUAL_MARKETING_ROUTES_RESULT"',
    ],
  ];
  for (const [needRef, gateEntry] of mergeReadySuiteValidations) {
    if (!mergeReady.includes(needRef) || !mergeReady.includes(gateEntry)) {
      issues.push(
        'merge-group PR Ready must validate every selected visual suite result'
      );
      break;
    }
  }
  // The selected-gate entries must feed a loop that actually exits nonzero on
  // a selected failure/skip and on an unselected run.
  const mergeReadyEnforcingLoop = [
    'for selected_gate in',
    '"$selected" == "true" && "$result" != "success"',
    '"$selected" != "true" && "$result" != "skipped"',
    'exit 1',
  ];
  if (
    mergeReadyEnforcingLoop.some(fragment => !mergeReady.includes(fragment))
  ) {
    issues.push(
      'merge-group PR Ready must validate every selected visual suite result'
    );
  }
  const sourceReady = extractJobBlock(ciYaml, 'ci-pr-ready');
  for (const jobId of mergeReadyRequiredJobs) {
    if (!sourceReady.includes(jobId)) {
      issues.push(
        'source PR Ready must require visual snapshot compare on homepage paths'
      );
      break;
    }
  }
  if (
    !sourceReady.includes(HOMEPAGE_VISUAL_SELECTION_OUTPUT) ||
    !/"\$VISUAL_COMPARE_RESULT" != "success"/.test(sourceReady) ||
    !/"\$VISUAL_HOMEPAGE_RESULT" != "success"/.test(sourceReady) ||
    !/"\$VISUAL_MARKETING_DOM_RESULT" != "success"/.test(sourceReady) ||
    !/"\$VISUAL_MARKETING_ROUTES_RESULT" != "success"/.test(sourceReady)
  ) {
    issues.push(
      'source PR Ready must fail closed when a homepage PR skips visual snapshot compare'
    );
  }

  return issues;
}

/**
 * @param {VisualSnapshotCompareInput} [input]
 * @returns {VisualSnapshotOutcome}
 */
export function runVisualSnapshotCompare({
  repoRoot,
  mode = VISUAL_COMPARE_MODE,
  existsSync,
  readFileSync,
  visualRegressionYaml,
  ciYaml,
} = {}) {
  const missingBaselinePaths = inventoryMissingBaselines({
    repoRoot,
    existsSync,
    readFileSync,
  });
  const workflowIssues = assertVisualCompareWorkflowContract({
    visualRegressionYaml,
    ciYaml,
  });
  const outcome = classifyVisualSnapshotOutcome({
    mode,
    updateSnapshots: false,
    missingBaselinePaths,
  });
  if (workflowIssues.length > 0) {
    return {
      ok: false,
      status: 'fail',
      reason: 'workflow-contract',
      missingBaselinePaths,
      workflowIssues,
    };
  }
  return { ...outcome, workflowIssues: [] };
}
