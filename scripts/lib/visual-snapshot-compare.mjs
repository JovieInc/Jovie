/**
 * Fail-closed visual snapshot compare (JOV-5459 / JOV-5960).
 *
 * Compare mode treats a missing baseline / ENOENT as FAIL. Refresh mode is the
 * only path allowed to pass --update-snapshots and self-heal missing files.
 * Advisory success is never a valid compare outcome. A skipped GitHub job
 * result is never a pass — homepage/marketing PRs must not green on skip.
 */

export const VISUAL_COMPARE_MODE = 'compare';
export const VISUAL_REFRESH_MODE = 'refresh';

export const VISUAL_SNAPSHOT_SPECS = Object.freeze([
  'apps/web/tests/e2e/visual-regression.spec.ts',
  'apps/web/tests/e2e/auth-visual.spec.ts',
  'apps/web/tests/e2e/chat-visual.spec.ts',
  'apps/web/tests/e2e/admin-visual-regression.spec.ts',
  'apps/web/tests/e2e/storybook-elevation.spec.ts',
]);

/** Public homepage + marketing surfaces that must never skip visual compare. */
export const HOMEPAGE_MARKETING_PATH_PATTERNS = Object.freeze([
  /^apps\/web\/app\/\(home\)\//,
  /^apps\/web\/app\/\(marketing\)\//,
  /^apps\/web\/components\/features\/home\//,
  /^apps\/web\/components\/features\/marketing\//,
  /^apps\/web\/components\/homepage\//,
  /^apps\/web\/components\/marketing\//,
  /^apps\/web\/data\/homepageFrontDoorCta\.ts$/,
  /^apps\/web\/data\/marketingCtaIntents\.ts$/,
  /^apps\/web\/lib\/flags\/marketing-static\.ts$/,
  /^apps\/web\/tests\/e2e\/visual-regression\.spec\.ts$/,
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
 * @param {string} [filePath]
 * @returns {boolean}
 */
export function isHomepageMarketingPath(filePath = '') {
  const normalized = String(filePath).replaceAll('\\', '/');
  return HOMEPAGE_MARKETING_PATH_PATTERNS.some(pattern =>
    pattern.test(normalized)
  );
}

/**
 * @param {readonly string[]} [files]
 * @returns {boolean}
 */
export function touchesHomepageMarketing(files = []) {
  return files.some(file => isHomepageMarketingPath(file));
}

/**
 * GitHub job conclusions for Visual Snapshot Compare.
 * Skip / not_run / empty is never a pass. Homepage/marketing diffs use a
 * dedicated reason so skip-as-green cannot land another Find-me-style PR.
 *
 * @param {{
 *   result?: string,
 *   homepageMarketingTouched?: boolean,
 * }} [input]
 * @returns {VisualSnapshotOutcome}
 */
export function classifyVisualGateJobResult({
  result,
  homepageMarketingTouched = false,
} = {}) {
  if (result === 'success') {
    return { ok: true, status: 'pass', reason: 'matched' };
  }
  if (result === 'skipped' || result === 'not_run' || !result) {
    return {
      ok: false,
      status: 'fail',
      reason: homepageMarketingTouched
        ? 'homepage-marketing-skip-must-not-pass'
        : 'skip-must-not-pass',
    };
  }
  return {
    ok: false,
    status: 'fail',
    reason: result === 'failure' ? 'compare-failed' : 'compare-not-success',
  };
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

  const compareJob = extractJobBlock(ciYaml, 'ci-visual-snapshot-compare');
  if (!compareJob) {
    issues.push('ci.yml must define ci-visual-snapshot-compare');
  } else {
    if (
      /^\s+- run:.*--update-snapshots/m.test(compareJob) ||
      compareJob.includes('UPDATE_FLAG="--update-snapshots"')
    ) {
      issues.push('compare job must not pass --update-snapshots');
    }
    if (compareJob.includes('continue-on-error')) {
      issues.push('compare job must not be advisory continue-on-error');
    }
    if (!compareJob.includes("github.event_name == 'pull_request'")) {
      issues.push(
        'compare job must run on pull_request (skip-as-green is forbidden)'
      );
    }
    if (!compareJob.includes("github.event_name == 'merge_group'")) {
      issues.push('compare job must run on merge_group');
    }
    if (compareJob.includes('neon-create-branch')) {
      issues.push('compare job must not provision Neon');
    }
  }

  const mergeReady = extractJobBlock(ciYaml, 'ci-merge-group-ready');
  if (!mergeReady.includes('ci-visual-snapshot-compare')) {
    issues.push('merge-group PR Ready must require visual snapshot compare');
  }
  if (
    !mergeReady.includes('VISUAL_COMPARE_RESULT') ||
    !mergeReady.includes('"Visual Snapshot Compare:$VISUAL_COMPARE_RESULT"')
  ) {
    issues.push(
      'merge-group PR Ready must fail when visual snapshot compare is skipped'
    );
  }
  const sourceReady = extractJobBlock(ciYaml, 'ci-pr-ready');
  if (!sourceReady.includes('ci-visual-snapshot-compare')) {
    issues.push(
      'source PR Ready must require visual snapshot compare (skip ≠ pass)'
    );
  }
  if (
    !sourceReady.includes('VISUAL_COMPARE_RESULT') ||
    !sourceReady.includes('"$VISUAL_COMPARE_RESULT" != "success"')
  ) {
    issues.push(
      'source PR Ready must fail when visual snapshot compare is skipped'
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
