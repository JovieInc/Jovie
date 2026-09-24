#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildAffectedTestPlan } from '../run-affected-tests.mjs';
import {
  MIN_CHANGED_LINE_COVERAGE,
  planChangedLineCoverage,
  runChangedLineCoverageCheck,
} from './changed-test-coverage.mjs';
import { validateFxExecutorIdentity } from './fx-remediation-lane.mjs';
import {
  parseRollingCiState,
  ROLLING_CI_POLICY_VERSION,
  rollingCiStateMarker,
  runDispatch,
  TRUSTED_CI_WORKFLOW_PATH,
  TRUSTED_REPOSITORY,
} from './rolling-ci-dispatch.mjs';
import {
  FX_ADAPTER_NAME,
  FX_HANDOFF_FAILURE,
  fxConfigurationIncident,
  parseHandoffReceipt,
  resolveFxAdapter,
  resolveRemediationRoute,
} from './rolling-ci-handoff.mjs';

export const CURSOR_AGENTS_URL = 'https://api.cursor.com/v1/agents';
export const FX_EXECUTION_RECEIPT_SCHEMA = 'jovie-fx-execution-receipt/v1';
export const FX_GITHUB_RUNNER_EXECUTOR = 'github-actions-runner';
export const FX_NAMED_OUTCOMES = Object.freeze([
  'launched',
  'repaired',
  'skipped_stale',
  'writer_missing',
  'no_key',
  'blocked_executor',
  'needs_human',
]);
export const RUNNER_FAILURE_CLASSES = Object.freeze([
  'checkout',
  'infra',
  'flake',
]);
export const FX_RUNNER_IDEMPOTENCY_KEY = 'jov-fx-ci-runners-20260822';
export const HOSTED_REPAIR_PLAN_SCHEMA = 'jovie-hosted-ci-repair-plan/v1';
export const HOSTED_PRELAUNCH_RECEIPT_SCHEMA =
  'jovie-hosted-ci-prelaunch-receipt/v1';
export const HOSTED_ACCEPTANCE_RECEIPT_SCHEMA =
  'jovie-hosted-ci-acceptance-receipt/v1';
export const HOSTED_TERMINAL_RECEIPT_SCHEMA =
  'jovie-hosted-ci-terminal-receipt/v1';
// Eight native GitHub prepare-job concurrency shards bound aggregate FX runs.
export const HOSTED_REPAIR_MAX_CONCURRENT = 8;
export const HOSTED_REPAIR_MAX_FILES = 8;
const HOSTED_REPAIR_MAX_TEST_COMPANIONS = 8;
export const HOSTED_REPAIR_MAX_PATCH_BYTES = 512 * 1024;
export const HOSTED_ACCEPTANCE_TTL_MS = 45 * 60 * 1000;

const HOSTED_REPAIR_TEST_COMMANDS = Object.freeze([
  'pnpm biome check <changed-files>',
  'pnpm run typecheck',
  'pnpm --filter @jovie/web exec vitest run <trusted-selected-unit-tests> --reporter=json',
  'pnpm --filter @jovie/web test:coverage --changed <authenticated-base> --bail 1 (when applicable)',
]);
const HOSTED_ALLOWED_PATH_RE = Object.freeze([
  /^apps\/web\/(?:app|components|hooks|lib|types)\/.+\.(?:[cm]?[jt]sx?)$/,
  /^packages\/[^/]+\/src\/.+\.(?:[cm]?[jt]sx?)$/,
]);
const HOSTED_DENIED_PATH_RE = Object.freeze([
  /(^|\/)\.github(\/|$)/i,
  /(^|\/)\.(?:agents|claude|codex|cursor)(\/|$)/i,
  /(^|\/)\.env(?:\.|$)/i,
  /(?:credential|secret|token|private[-_]?key|\.pem$|\.p12$|\.key$)/i,
  /(^|\/)(?:drizzle|migrations?)(?:[._-]|\/|$)/i,
  /(^|\/)(?:auth|authentication|oauth|clerk|sessions?)(?:[._-]|\/|$)/i,
  /(?:^|\/)(?:billing|payments?|stripe|entitlements?)(?:[._-]|\/|$)/i,
  /(?:^|\/)(?:release|deployment|deploy|vercel)(?:[._-]|\/|$)/i,
  /(?:^|\/)proxy\.ts$/i,
  /(?:^|\/)(?:package\.json|pnpm-lock\.yaml|turbo\.json|biome\.jsonc?)$/i,
  /(?:^|\/)(?:tests?|__tests__|__snapshots__)(?:\/|$)/i,
  /\.(?:test|spec)\.[cm]?[jt]sx?$/i,
  /scripts\/lib\/(?:rolling-ci|safe-pr-remediation)/i,
]);
const CREATE_HOSTED_COMMIT_MUTATION = `mutation HostedCiRepair($input: CreateCommitOnBranchInput!) {
  createCommitOnBranch(input: $input) {
    commit { oid url }
  }
}`;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function assertExactSha(value, name) {
  if (!/^[0-9a-f]{40}$/.test(String(value ?? ''))) {
    throw new Error(`${name} must be an exact lowercase SHA`);
  }
}

function assertPositiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
}

function assertSafeHeadRef(value) {
  const ref = String(value ?? '');
  if (
    !ref ||
    ref === 'main' ||
    ref.startsWith('refs/') ||
    ref.startsWith('gh-readonly-queue/') ||
    /(?:\.\.|[\s~^:?*\\[]|@\{|\.$|\/$)/.test(ref)
  ) {
    throw new Error('headRefName is main, synthetic, or not a safe branch ref');
  }
  return ref;
}

function assertHostedRepairPlan(plan) {
  if (
    plan?.schema !== HOSTED_REPAIR_PLAN_SCHEMA ||
    plan.policyVersion !== ROLLING_CI_POLICY_VERSION ||
    plan.repository !== TRUSTED_REPOSITORY ||
    plan.producerEvent !== 'pull_request' ||
    typeof plan.fingerprint !== 'string' ||
    !plan.fingerprint.startsWith('ci:')
  ) {
    throw new Error('invalid hosted repair plan authority');
  }
  assertPositiveInteger(plan.prNumber, 'prNumber');
  assertPositiveInteger(plan.workflowRunAttempt, 'workflowRunAttempt');
  if (!/^\d+$/.test(String(plan.workflowRunId ?? ''))) {
    throw new Error('workflowRunId must be numeric');
  }
  if (!/^\d+$/.test(String(plan.checkSuiteId ?? ''))) {
    throw new Error('checkSuiteId must be numeric');
  }
  assertExactSha(plan.expectedHeadOid, 'expectedHeadOid');
  assertExactSha(plan.baseSha, 'baseSha');
  assertSafeHeadRef(plan.headRefName);
  if (
    !Array.isArray(plan.allowedPaths) ||
    plan.allowedPaths.length < 1 ||
    plan.allowedPaths.length > HOSTED_REPAIR_MAX_FILES ||
    new Set(plan.allowedPaths).size !== plan.allowedPaths.length ||
    plan.allowedPaths.some(path => !validateHostedRepairPath(path).allowed)
  ) {
    throw new Error('hosted repair plan requires bounded source paths');
  }
  if (
    !Array.isArray(plan.diffFiles) ||
    plan.diffFiles.length >
      HOSTED_REPAIR_MAX_FILES + HOSTED_REPAIR_MAX_TEST_COMPANIONS
  ) {
    throw new Error(
      'hosted repair plan requires a bounded immutable test inventory'
    );
  }
  const sourcePaths = new Set(plan.allowedPaths);
  const companionFiles = plan.diffFiles.filter(
    file => validateHostedTestCompanion(file?.path).allowed
  );
  if (companionFiles.length > HOSTED_REPAIR_MAX_TEST_COMPANIONS) {
    throw new Error('hosted repair plan exceeds the test companion limit');
  }
  const inventoryPaths = new Set();
  for (const file of plan.diffFiles) {
    const isSource = sourcePaths.has(file?.path);
    const isCompanion = validateHostedTestCompanion(file?.path).allowed;
    if (
      (!isSource && !isCompanion) ||
      inventoryPaths.has(file.path) ||
      (isSource
        ? file?.status !== 'modified'
        : !['added', 'modified'].includes(file?.status)) ||
      file?.mode !== '100644' ||
      !/^[0-9a-f]{40}$/.test(file?.blobSha ?? '')
    ) {
      throw new Error(
        'hosted repair plan contains an invalid PR file inventory'
      );
    }
    inventoryPaths.add(file.path);
  }
  if (
    [...sourcePaths, ...companionFiles.map(file => file.path)].some(
      path => !inventoryPaths.has(path)
    )
  ) {
    throw new Error('hosted repair plan test inventory identity mismatch');
  }
  const expectedKey = `${plan.repository}:pr-${plan.prNumber}:${plan.expectedHeadOid}:${plan.fingerprint}:${plan.policyVersion}`;
  if (plan.idempotencyKey !== expectedKey) {
    throw new Error('hosted repair idempotency key is not exact-head bound');
  }
  return plan;
}

/** Build the immutable authority passed from the trusted controller. */
export function buildHostedRepairPlan(input = {}) {
  const event = input.dispatch?.events?.find(
    candidate =>
      candidate.fingerprint === input.dispatch?.state?.claim?.fingerprint
  );
  if (
    input.dispatch?.mutate !== true ||
    !['dispatch_implementer', 'dispatch_superseding_head'].includes(
      input.dispatch?.action
    ) ||
    !event
  ) {
    throw new Error('dispatch does not authorize a hosted repair');
  }
  assertExactSha(input.baseSha, 'baseSha');
  if (
    !Array.isArray(input.changedFiles) ||
    input.changedFiles.length < 1 ||
    input.changedFiles.length >
      HOSTED_REPAIR_MAX_FILES + HOSTED_REPAIR_MAX_TEST_COMPANIONS
  ) {
    throw new Error(
      'entire PR diff must contain a bounded admitted source and test inventory'
    );
  }
  const sourceFiles = input.changedFiles.filter(
    file => validateHostedRepairPath(file?.filename).allowed
  );
  const testCompanionFiles = input.changedFiles.filter(
    file => validateHostedTestCompanion(file?.filename).allowed
  );
  if (
    sourceFiles.length < 1 ||
    sourceFiles.length > HOSTED_REPAIR_MAX_FILES ||
    testCompanionFiles.length > HOSTED_REPAIR_MAX_TEST_COMPANIONS ||
    sourceFiles.length + testCompanionFiles.length !==
      input.changedFiles.length ||
    sourceFiles.some(file => file.status !== 'modified') ||
    testCompanionFiles.some(
      file => !['added', 'modified'].includes(file.status)
    ) ||
    input.changedFiles.some(
      file =>
        file.mode !== '100644' || !/^[0-9a-f]{40}$/.test(file?.blobSha ?? '')
    )
  ) {
    throw new Error(
      'entire PR diff must contain only admitted modified sources and ordinary unit-test companions'
    );
  }
  const plan = {
    schema: HOSTED_REPAIR_PLAN_SCHEMA,
    policyVersion: ROLLING_CI_POLICY_VERSION,
    repository: event.repository,
    prNumber: event.pr,
    expectedHeadOid: event.head,
    baseSha: input.baseSha,
    headRefName: assertSafeHeadRef(input.headRefName),
    producerEvent: event.source?.producerEvent,
    workflowRunId: event.workflowRunId,
    workflowRunAttempt: event.attempt,
    checkSuiteId: event.checkSuiteId,
    fingerprint: event.fingerprint,
    failedChecks: (input.dispatch.events ?? []).map(candidate => ({
      check: candidate.check,
      failedSteps: [...(candidate.failedSteps ?? [])],
    })),
    allowedPaths: sourceFiles.map(file => file.filename).sort(),
    diffFiles: input.changedFiles
      .map(file => ({
        path: file.filename,
        status: file.status,
        mode: file.mode,
        blobSha: file.blobSha,
      }))
      .sort((left, right) => left.path.localeCompare(right.path)),
    idempotencyKey: `${event.repository}:pr-${event.pr}:${event.head}:${event.fingerprint}:${ROLLING_CI_POLICY_VERSION}`,
    maxConcurrent: HOSTED_REPAIR_MAX_CONCURRENT,
  };
  return assertHostedRepairPlan(plan);
}

export function buildHostedPrelaunchReceipt({ plan, now = new Date() }) {
  assertHostedRepairPlan(plan);
  return {
    schema: HOSTED_PRELAUNCH_RECEIPT_SCHEMA,
    policyVersion: plan.policyVersion,
    stage: 'prelaunch',
    status: 'planned',
    terminal: false,
    repository: plan.repository,
    prNumber: plan.prNumber,
    expectedHeadOid: plan.expectedHeadOid,
    fingerprint: plan.fingerprint,
    idempotencyKey: plan.idempotencyKey,
    maxConcurrent: HOSTED_REPAIR_MAX_CONCURRENT,
    observedAt: new Date(now).toISOString(),
  };
}

export function isHostedRemediationSelfTrigger({ plan, commitMessage }) {
  assertHostedRepairPlan(plan);
  const message = String(commitMessage ?? '');
  return (
    message.includes('Jovie hosted CI remediation') &&
    message.includes(`Policy: ${plan.policyVersion}`) &&
    message.includes(`Failure: ${plan.fingerprint}`)
  );
}

export function validateHostedRepairPath(path) {
  const normalized = String(path ?? '').replaceAll('\\', '/');
  if (
    !normalized ||
    normalized.startsWith('/') ||
    normalized.includes('/../') ||
    normalized.startsWith('../') ||
    HOSTED_DENIED_PATH_RE.some(pattern => pattern.test(normalized)) ||
    !HOSTED_ALLOWED_PATH_RE.some(pattern => pattern.test(normalized))
  ) {
    return { allowed: false, reason: 'path-outside-hosted-repair-policy' };
  }
  return { allowed: true, path: normalized };
}

export function validateHostedTestCompanion(path) {
  const raw = String(path ?? '');
  const normalized = raw.replaceAll('\\', '/');
  const segments = normalized.split('/');
  const filename = segments.at(-1) ?? '';
  const allowed =
    raw === normalized &&
    /^apps\/web\/tests\/unit\/.+\.(?:test|spec)\.[cm]?[jt]sx?$/.test(
      normalized
    ) &&
    !segments.some(
      segment => !segment || segment === '.' || segment === '..'
    ) &&
    !segments.some(segment =>
      /^(?:__)?(?:helpers?|snapshots?|fixtures?|e2e|performance|setup|utils?)(?:__)?$/i.test(
        segment
      )
    ) &&
    !/^(?:setup|vitest\.setup|test-setup)(?:\.[^/]*)?$/i.test(filename) &&
    !/(?:^|[-_.])(?:helper|util)s?\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(
      filename
    );
  return allowed
    ? { allowed: true, path: normalized }
    : { allowed: false, reason: 'path-outside-hosted-test-companion-policy' };
}

function validateHostedChanges(changes) {
  if (
    !Array.isArray(changes) ||
    changes.length < 1 ||
    changes.length > HOSTED_REPAIR_MAX_FILES
  ) {
    throw new Error('hosted repair must modify a bounded non-empty file set');
  }
  const unique = new Set();
  for (const change of changes) {
    const policy = validateHostedRepairPath(change?.path);
    if (!policy.allowed) throw new Error(`${change?.path}: ${policy.reason}`);
    if (unique.has(policy.path)) throw new Error('duplicate changed path');
    unique.add(policy.path);
    if (
      change?.status !== 'M' ||
      change?.symlink === true ||
      !Number.isInteger(change?.bytes) ||
      change.bytes < 1 ||
      change.bytes > HOSTED_REPAIR_MAX_PATCH_BYTES ||
      !/^[0-9a-f]{64}$/.test(change?.sha256 ?? '')
    ) {
      throw new Error(`${policy.path}: unsafe repair file transition`);
    }
  }
  return [...changes].sort((left, right) =>
    left.path.localeCompare(right.path)
  );
}

function gitOutput(repository, args) {
  return execFileSync('git', args, {
    cwd: repository,
    encoding: 'utf8',
  }).trim();
}

function gitTreeInventory(repository, revision, paths) {
  const output = execFileSync(
    'git',
    ['ls-tree', '-r', '-z', revision, '--', ...paths],
    { cwd: repository }
  ).toString('utf8');
  return new Map(
    output
      .split('\0')
      .filter(Boolean)
      .map(record => {
        const [metadata, path] = record.split('\t');
        const [mode, type, blobSha] = metadata.split(' ');
        return [path, { mode, type, blobSha }];
      })
  );
}

function assertHostedCandidateTree({
  plan,
  repository,
  testCommitOid,
  changes,
}) {
  assertHostedRepairPlan(plan);
  assertExactSha(testCommitOid, 'testCommitOid');
  const head = gitOutput(repository, ['rev-parse', 'HEAD']);
  const parent = gitOutput(repository, [
    'show',
    '-s',
    '--format=%P',
    testCommitOid,
  ]);
  if (head !== testCommitOid || parent !== plan.expectedHeadOid) {
    throw new Error(
      'test tree is not one exact patch commit on the authenticated PR head'
    );
  }
  if (
    gitOutput(repository, ['status', '--porcelain=v1', '--untracked-files=all'])
  ) {
    throw new Error(
      'candidate working tree changed outside the exact patch commit'
    );
  }
  const paths = gitOutput(repository, [
    'diff',
    '--name-only',
    '-z',
    '--no-renames',
    '--diff-filter=ACMR',
    `${plan.baseSha}...${testCommitOid}`,
  ])
    .split('\0')
    .filter(Boolean)
    .sort();
  const expectedPaths = plan.diffFiles.map(file => file.path).sort();
  if (JSON.stringify(paths) !== JSON.stringify(expectedPaths)) {
    throw new Error('test tree paths do not match the authenticated PR diff');
  }
  const headInventory = gitTreeInventory(
    repository,
    plan.expectedHeadOid,
    plan.diffFiles.map(file => file.path)
  );
  const testInventory = gitTreeInventory(
    repository,
    testCommitOid,
    plan.diffFiles.map(file => file.path)
  );
  for (const file of plan.diffFiles) {
    const actual = headInventory.get(file.path);
    if (
      actual?.type !== 'blob' ||
      actual.mode !== file.mode ||
      actual.blobSha !== file.blobSha
    ) {
      throw new Error(`${file.path}: authenticated PR tree identity mismatch`);
    }
    const pathStat = lstatSync(join(repository, file.path));
    if (!pathStat.isFile() || pathStat.isSymbolicLink()) {
      throw new Error(`${file.path}: non-regular PR file is not allowed`);
    }
    const testedFile = testInventory.get(file.path);
    if (testedFile?.type !== 'blob' || testedFile.mode !== file.mode) {
      throw new Error(
        `${file.path}: tested PR file mode differs from its authenticated identity`
      );
    }
    if (
      validateHostedTestCompanion(file.path).allowed &&
      testedFile.blobSha !== file.blobSha
    ) {
      throw new Error(
        `${file.path}: tested companion differs from the authenticated PR blob`
      );
    }
  }
  const repairChanges = validateHostedChanges(changes);
  if (repairChanges.some(change => !plan.allowedPaths.includes(change.path))) {
    throw new Error(
      'repair changed a path outside the source-only permission set'
    );
  }
  for (const change of repairChanges) {
    const bytes = readFileSync(join(repository, change.path));
    if (bytes.length !== change.bytes || sha256(bytes) !== change.sha256) {
      throw new Error(
        `${change.path}: tested source bytes differ from the immutable patch artifact`
      );
    }
  }
  const treeSha = gitOutput(repository, [
    'rev-parse',
    `${testCommitOid}^{tree}`,
  ]);
  return { testCommitOid, testTreeSha: treeSha };
}

function assertHostedTestSelection(plan, repository) {
  const selection = buildAffectedTestPlan(
    plan.diffFiles.map(file => file.path),
    {
      isFileAvailable(path) {
        try {
          const stat = lstatSync(join(repository, path));
          return stat.isFile() && !stat.isSymbolicLink();
        } catch {
          return false;
        }
      },
    }
  );
  const unsupported = [
    selection.rootVitestTests,
    selection.pythonTests,
    selection.pythonUnittestTests,
    selection.scriptVitestTests,
    selection.nodeTests,
  ].some(files => (files ?? []).length > 0);
  const selectedTests = [...(selection.selectedTests ?? [])].sort();
  if (
    selection.mode !== 'selected' ||
    unsupported ||
    selectedTests.length < 1 ||
    selectedTests.some(path => {
      if (!validateHostedTestCompanion(path).allowed) return true;
      try {
        const stat = lstatSync(join(repository, path));
        return !stat.isFile() || stat.isSymbolicLink();
      } catch {
        return true;
      }
    }) ||
    plan.diffFiles.some(
      file =>
        validateHostedTestCompanion(file.path).allowed &&
        !selectedTests.includes(file.path)
    )
  ) {
    throw new Error(
      'trusted affected-test selector did not produce a bounded unit-test plan'
    );
  }
  return { mode: selection.mode, selectedTests };
}

/** Build a trusted, exact-tree test plan from the authenticated PR and patch. */
export function buildHostedTestPlan({
  plan,
  patchBytes,
  changes,
  repository,
  testCommitOid,
}) {
  const patch = Buffer.from(patchBytes ?? '');
  if (patch.length < 1 || patch.length > HOSTED_REPAIR_MAX_PATCH_BYTES) {
    throw new Error('hosted repair patch is empty or exceeds the byte limit');
  }
  const tree = assertHostedCandidateTree({
    plan,
    repository,
    testCommitOid,
    changes,
  });
  const selection = assertHostedTestSelection(plan, repository);
  const coverage = planChangedLineCoverage({
    base: plan.baseSha,
    head: testCommitOid,
    repoRoot: repository,
  });
  return {
    repository: plan.repository,
    prNumber: plan.prNumber,
    baseSha: plan.baseSha,
    expectedHeadOid: plan.expectedHeadOid,
    testCommitOid: tree.testCommitOid,
    testTreeSha: tree.testTreeSha,
    patchSha256: sha256(patch),
    selectorMode: selection.mode,
    selectedTests: selection.selectedTests,
    coveragePlan: coverage,
  };
}

function validateHostedVitestReport(report, selectedTests, repository) {
  const expected = [...selectedTests].sort();
  const results = report?.testResults;
  const assertionCount = Array.isArray(results)
    ? results.reduce(
        (total, result) => total + (result.assertionResults?.length ?? 0),
        0
      )
    : 0;
  if (
    !Array.isArray(results) ||
    report.success !== true ||
    (report.unhandledErrors !== undefined &&
      report.unhandledErrors !== null &&
      (!Array.isArray(report.unhandledErrors) ||
        report.unhandledErrors.length > 0)) ||
    results.length !== expected.length ||
    (report.numTotalTestSuites !== undefined &&
      report.numPassedTestSuites !== report.numTotalTestSuites) ||
    (report.numPassedTestSuites !== undefined &&
      !Number.isInteger(report.numPassedTestSuites)) ||
    (report.numFailedTestSuites ?? 0) !== 0 ||
    (report.numPendingTestSuites ?? 0) !== 0 ||
    !Number.isInteger(report.numTotalTests) ||
    report.numTotalTests < 1 ||
    !Number.isInteger(report.numPassedTests) ||
    report.numPassedTests < 1 ||
    report.numPassedTests !== report.numTotalTests ||
    report.numTotalTests !== assertionCount ||
    (report.numFailedTests ?? 0) !== 0 ||
    (report.numPendingTests ?? 0) !== 0 ||
    (report.numSkippedTests ?? 0) !== 0 ||
    (report.numTodoTests ?? 0) !== 0
  ) {
    throw new Error(
      'Vitest report is empty, incomplete, or contains failed/skipped tests'
    );
  }
  const actual = results
    .map(result => {
      const name = String(result?.name ?? '').replaceAll('\\', '/');
      const marker = 'apps/web/tests/unit/';
      const index = name.lastIndexOf(marker);
      if (index >= 0) return name.slice(index);
      if (name.startsWith('tests/unit/')) return `apps/web/${name}`;
      return name.startsWith(`${repository}/`)
        ? relative(repository, name).replaceAll('\\', '/')
        : name;
    })
    .sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      'Vitest report is missing required tests or includes unrelated tests'
    );
  }
  for (const result of results) {
    if (
      result.status !== 'passed' ||
      !Array.isArray(result.assertionResults) ||
      result.assertionResults.length < 1 ||
      result.assertionResults.some(assertion => assertion.status !== 'passed')
    ) {
      throw new Error(
        `Vitest did not pass every required assertion in ${result.name}`
      );
    }
  }
}

function validateHostedCoverageMaps(coverageBytes) {
  const coverage = JSON.parse(Buffer.from(coverageBytes).toString('utf8'));
  if (!coverage || typeof coverage !== 'object' || Array.isArray(coverage)) {
    throw new Error('changed-line coverage report is not a file map');
  }
  for (const [path, file] of Object.entries(coverage)) {
    const statementMap = file?.statementMap;
    const statementCounts = file?.s;
    if (
      !path ||
      [file, statementMap, statementCounts].some(
        value => !value || typeof value !== 'object' || Array.isArray(value)
      ) ||
      JSON.stringify(Object.keys(statementMap).sort()) !==
        JSON.stringify(Object.keys(statementCounts).sort())
    ) {
      throw new Error(`changed-line coverage maps are invalid for ${path}`);
    }
    for (const [id, location] of Object.entries(statementMap)) {
      const { start, end } = location ?? {};
      if (
        !Number.isSafeInteger(start?.line) ||
        start.line < 1 ||
        !Number.isSafeInteger(start?.column) ||
        start.column < 0 ||
        !Number.isSafeInteger(end?.line) ||
        end.line < start.line ||
        !Number.isSafeInteger(end?.column) ||
        end.column < 0 ||
        (end.line === start.line && end.column < start.column) ||
        typeof statementCounts[id] !== 'number' ||
        !Number.isFinite(statementCounts[id]) ||
        statementCounts[id] < 0
      ) {
        throw new Error(
          `changed-line coverage statement is invalid for ${path}`
        );
      }
    }
  }
}

function validateHostedCoverageResult(coveragePlan, coverageResult) {
  if (!coveragePlan?.applicable) {
    if (coverageResult?.applicable === true) {
      throw new Error(
        'coverage receipt unexpectedly differs from its exact-tree plan'
      );
    }
    return;
  }
  if (
    coverageResult?.applicable !== true ||
    coverageResult.ok !== true ||
    coverageResult.minimum !== MIN_CHANGED_LINE_COVERAGE ||
    (coverageResult.percentage !== null &&
      coverageResult.percentage < coverageResult.minimum) ||
    !Array.isArray(coverageResult.missingFiles) ||
    coverageResult.missingFiles.length > 0 ||
    !Array.isArray(coverageResult.files)
  ) {
    throw new Error(
      'exact-head changed-line coverage is missing, stale, or below its floor'
    );
  }
  const actualPaths = coverageResult.files.map(file => file.path).sort();
  const expectedPaths = coveragePlan.files.slice().sort();
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    throw new Error(
      'changed-line coverage report does not match the exact changed source paths'
    );
  }
}

export function validateHostedTestReports({
  plan,
  trustedTestPlan,
  patchBytes,
  reportBytes,
  coverageBytes,
  expectedTestCommitOid,
  expectedTestTreeSha,
  coverageResult,
  repository = process.cwd(),
}) {
  try {
    assertHostedRepairPlan(plan);
    const reportBuffer = Buffer.from(reportBytes ?? '');
    const coverageBuffer =
      coverageBytes == null ? null : Buffer.from(coverageBytes);
    if (
      reportBuffer.length < 1 ||
      trustedTestPlan?.repository !== plan.repository ||
      trustedTestPlan?.prNumber !== plan.prNumber ||
      trustedTestPlan?.baseSha !== plan.baseSha ||
      trustedTestPlan?.expectedHeadOid !== plan.expectedHeadOid ||
      trustedTestPlan?.testCommitOid !== expectedTestCommitOid ||
      trustedTestPlan?.testTreeSha !== expectedTestTreeSha ||
      trustedTestPlan?.patchSha256 !== sha256(Buffer.from(patchBytes ?? ''))
    ) {
      return { accepted: false, reason: 'test-report-identity-mismatch' };
    }
    const report = JSON.parse(reportBuffer.toString('utf8'));
    assertExactSha(trustedTestPlan.testCommitOid, 'testCommitOid');
    assertExactSha(expectedTestTreeSha, 'testTreeSha');
    if (
      trustedTestPlan.selectorMode !== 'selected' ||
      !Array.isArray(trustedTestPlan.selectedTests) ||
      trustedTestPlan.selectedTests.length < 1 ||
      new Set(trustedTestPlan.selectedTests).size !==
        trustedTestPlan.selectedTests.length ||
      trustedTestPlan.selectedTests.some(
        path => !validateHostedTestCompanion(path).allowed
      ) ||
      plan.diffFiles.some(
        file =>
          validateHostedTestCompanion(file.path).allowed &&
          !trustedTestPlan.selectedTests.includes(file.path)
      )
    ) {
      return { accepted: false, reason: 'test-selection-identity-mismatch' };
    }
    validateHostedVitestReport(
      report,
      trustedTestPlan.selectedTests,
      repository
    );
    const applicable = trustedTestPlan.coveragePlan?.applicable === true;
    if (
      applicable !== (coverageBuffer !== null) ||
      (coverageBuffer !== null && coverageBuffer.length < 1)
    ) {
      return { accepted: false, reason: 'coverage-artifact-mismatch' };
    }
    if (coverageBuffer) validateHostedCoverageMaps(coverageBuffer);
    validateHostedCoverageResult(trustedTestPlan.coveragePlan, coverageResult);
    return {
      accepted: true,
      testReportSha256: sha256(reportBuffer),
      coverageSha256: coverageBuffer ? sha256(coverageBuffer) : null,
    };
  } catch (error) {
    return {
      accepted: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export function buildHostedAcceptanceReceipt({
  plan,
  patchBytes,
  changes,
  executor,
  trustedTestPlan,
  testReportBytes,
  coverageBytes,
  workflowRunId,
  workflowRunAttempt,
  patchArtifactId,
  testArtifactId,
  expectedTestCommitOid,
  expectedTestTreeSha,
  coverageResult,
  repository = process.cwd(),
  now = new Date(),
}) {
  assertHostedRepairPlan(plan);
  const patch = Buffer.from(patchBytes ?? '');
  if (patch.length < 1 || patch.length > HOSTED_REPAIR_MAX_PATCH_BYTES) {
    throw new Error('hosted repair patch is empty or exceeds the byte limit');
  }
  const acceptedChanges = validateHostedChanges(changes);
  if (
    acceptedChanges.some(change => !plan.allowedPaths.includes(change.path))
  ) {
    throw new Error('repair changed a path outside the exact PR diff');
  }
  if (!validateFxExecutorIdentity(executor)) {
    throw new Error('executor identity is missing or malformed');
  }
  if (
    !/^\d+$/.test(String(workflowRunId ?? '')) ||
    !/^\d+$/.test(String(patchArtifactId ?? '')) ||
    !/^\d+$/.test(String(testArtifactId ?? ''))
  ) {
    throw new Error('workflow and evidence artifact identities are required');
  }
  assertPositiveInteger(Number(workflowRunAttempt), 'workflowRunAttempt');
  assertExactSha(expectedTestCommitOid, 'testCommitOid');
  assertExactSha(expectedTestTreeSha, 'testTreeSha');
  const verification = validateHostedTestReports({
    plan,
    trustedTestPlan,
    patchBytes: patch,
    reportBytes: testReportBytes,
    coverageBytes,
    expectedTestCommitOid,
    expectedTestTreeSha,
    coverageResult,
    repository,
  });
  if (!verification.accepted) throw new Error(verification.reason);
  return {
    schema: HOSTED_ACCEPTANCE_RECEIPT_SCHEMA,
    policyVersion: plan.policyVersion,
    stage: 'acceptance',
    status: 'accepted',
    terminal: false,
    repository: plan.repository,
    prNumber: plan.prNumber,
    baseSha: plan.baseSha,
    expectedHeadOid: plan.expectedHeadOid,
    fingerprint: plan.fingerprint,
    idempotencyKey: plan.idempotencyKey,
    maxConcurrent: HOSTED_REPAIR_MAX_CONCURRENT,
    executor,
    patchSha256: sha256(patch),
    changedFiles: acceptedChanges,
    testCommitOid: expectedTestCommitOid,
    testTreeSha: expectedTestTreeSha,
    testReportSha256: verification.testReportSha256,
    coverageApplicable: trustedTestPlan.coveragePlan.applicable,
    coverageSha256: verification.coverageSha256,
    workflowRunId: String(workflowRunId),
    workflowRunAttempt: Number(workflowRunAttempt),
    patchArtifactId: String(patchArtifactId),
    testArtifactId: String(testArtifactId),
    testsPassed: true,
    testCommands: [...HOSTED_REPAIR_TEST_COMMANDS],
    observedAt: new Date(now).toISOString(),
  };
}

export function validateHostedAcceptance({ plan, acceptance, patchBytes }) {
  try {
    assertHostedRepairPlan(plan);
    if (
      acceptance?.schema !== HOSTED_ACCEPTANCE_RECEIPT_SCHEMA ||
      acceptance.policyVersion !== plan.policyVersion ||
      acceptance.repository !== plan.repository ||
      acceptance.prNumber !== plan.prNumber ||
      acceptance.expectedHeadOid !== plan.expectedHeadOid ||
      acceptance.fingerprint !== plan.fingerprint ||
      acceptance.idempotencyKey !== plan.idempotencyKey ||
      acceptance.maxConcurrent !== HOSTED_REPAIR_MAX_CONCURRENT ||
      acceptance.testsPassed !== true ||
      !/^[0-9a-f]{40}$/.test(acceptance.testCommitOid ?? '') ||
      !/^[0-9a-f]{40}$/.test(acceptance.testTreeSha ?? '') ||
      !/^[0-9a-f]{64}$/.test(acceptance.testReportSha256 ?? '') ||
      typeof acceptance.coverageApplicable !== 'boolean' ||
      acceptance.coverageApplicable !== (acceptance.coverageSha256 !== null) ||
      (acceptance.coverageSha256 !== null &&
        !/^[0-9a-f]{64}$/.test(acceptance.coverageSha256 ?? '')) ||
      acceptance.baseSha !== plan.baseSha ||
      !/^\d+$/.test(String(acceptance.workflowRunId ?? '')) ||
      !Number.isInteger(acceptance.workflowRunAttempt) ||
      acceptance.workflowRunAttempt < 1 ||
      !/^\d+$/.test(String(acceptance.patchArtifactId ?? '')) ||
      !/^\d+$/.test(String(acceptance.testArtifactId ?? '')) ||
      acceptance.patchSha256 !== sha256(Buffer.from(patchBytes ?? '')) ||
      !validateFxExecutorIdentity(acceptance.executor) ||
      JSON.stringify(acceptance.testCommands) !==
        JSON.stringify(HOSTED_REPAIR_TEST_COMMANDS)
    ) {
      return { accepted: false, reason: 'acceptance-identity-mismatch' };
    }
    validateHostedChanges(acceptance.changedFiles);
    if (
      acceptance.changedFiles.some(
        change => !plan.allowedPaths.includes(change.path)
      )
    ) {
      return { accepted: false, reason: 'acceptance-path-not-in-plan' };
    }
    return { accepted: true };
  } catch (error) {
    return {
      accepted: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export function buildHostedCommitVariables({
  plan,
  acceptance,
  patchBytes,
  fileContents,
}) {
  const accepted = validateHostedAcceptance({
    plan,
    acceptance,
    patchBytes,
  });
  if (!accepted.accepted) throw new Error(accepted.reason);
  const additions = acceptance.changedFiles.map(change => {
    const contents = fileContents?.[change.path];
    if (!Buffer.isBuffer(contents) || sha256(contents) !== change.sha256) {
      throw new Error(`${change.path}: immutable artifact hash mismatch`);
    }
    return { path: change.path, contents: contents.toString('base64') };
  });
  return {
    input: {
      branch: {
        repositoryNameWithOwner: plan.repository,
        branchName: plan.headRefName,
      },
      expectedHeadOid: plan.expectedHeadOid,
      message: {
        headline: 'fix(ci): apply bounded hosted remediation',
        body: `Jovie hosted CI remediation for PR #${plan.prNumber}.\n\nPolicy: ${plan.policyVersion}\nFailure: ${plan.fingerprint}\nReceipt: ${acceptance.patchSha256}`,
      },
      fileChanges: { additions },
    },
  };
}

export function buildHostedTerminalReceipt({
  plan,
  outcome,
  committedHeadOid = null,
  acceptance = null,
  now = new Date(),
}) {
  assertHostedRepairPlan(plan);
  const allowedOutcomes = new Set([
    'repaired',
    'superseded_green',
    'stale_head',
    'capacity_denied',
    'patch_rejected',
    'tests_failed',
    'executor_failed',
    'recursive_dispatch_blocked',
    'writer_failed',
  ]);
  if (!allowedOutcomes.has(outcome))
    throw new Error('invalid terminal outcome');
  if (outcome === 'repaired')
    assertExactSha(committedHeadOid, 'committedHeadOid');
  return {
    schema: HOSTED_TERMINAL_RECEIPT_SCHEMA,
    policyVersion: plan.policyVersion,
    stage: 'terminal',
    status: outcome === 'repaired' ? 'completed' : 'aborted',
    terminal: true,
    outcome,
    repository: plan.repository,
    prNumber: plan.prNumber,
    expectedHeadOid: plan.expectedHeadOid,
    committedHeadOid,
    fingerprint: plan.fingerprint,
    idempotencyKey: plan.idempotencyKey,
    acceptanceSha256: acceptance
      ? sha256(Buffer.from(JSON.stringify(acceptance)))
      : null,
    observedAt: new Date(now).toISOString(),
  };
}

export function classifyHostedReceiptLiveness({
  plan,
  prelaunch,
  acceptance = null,
  terminal = null,
  now = new Date(),
}) {
  try {
    assertHostedRepairPlan(plan);
  } catch {
    return { live: false, state: 'invalid' };
  }
  const identityMatches = receipt =>
    receipt?.policyVersion === plan.policyVersion &&
    receipt?.repository === plan.repository &&
    receipt?.prNumber === plan.prNumber &&
    receipt?.expectedHeadOid === plan.expectedHeadOid &&
    receipt?.fingerprint === plan.fingerprint &&
    receipt?.idempotencyKey === plan.idempotencyKey;
  if (
    terminal?.schema === HOSTED_TERMINAL_RECEIPT_SCHEMA &&
    terminal.terminal === true &&
    identityMatches(terminal)
  ) {
    return { live: false, state: 'terminal', outcome: terminal.outcome };
  }
  if (
    acceptance?.schema === HOSTED_ACCEPTANCE_RECEIPT_SCHEMA &&
    identityMatches(acceptance)
  ) {
    const ageMs = new Date(now).getTime() - Date.parse(acceptance.observedAt);
    return Number.isFinite(ageMs) &&
      ageMs >= 0 &&
      ageMs <= HOSTED_ACCEPTANCE_TTL_MS
      ? { live: true, state: 'accepted' }
      : { live: false, state: 'stale_acceptance' };
  }
  if (
    prelaunch?.schema === HOSTED_PRELAUNCH_RECEIPT_SCHEMA &&
    identityMatches(prelaunch)
  ) {
    return { live: false, state: 'prelaunch_only' };
  }
  return { live: false, state: 'missing' };
}

const CHECKOUT_FAILURE_RE = /checkout/i;
const INFRA_FAILURE_RE =
  /startup_failure|timed_out|heartbeat|hosted runner|lost communication|set up job|initialize containers|\brunner\b/i;
const FLAKE_FAILURE_RE =
  /flake|eagain|etimedout|rate.?limit|\b50[23]\b|spurious/i;
const PRODUCT_FAILURE_RE =
  /typecheck|unit tests|knip|eval|brand safety|overflow|layout|\blint\b|promptfoo/i;

export function cursorAuthHeader(apiKey) {
  return `Basic ${Buffer.from(`${apiKey}:`, 'utf8').toString('base64')}`;
}

export function findOwnedAgents(agents, fingerprint) {
  const needle = String(fingerprint ?? '');
  if (!needle) return [];
  return (Array.isArray(agents) ? agents : [])
    .filter(agent =>
      JSON.stringify(agent ?? {})
        .toLowerCase()
        .includes(needle.toLowerCase())
    )
    .map(agent => agent?.id)
    .filter(id => typeof id === 'string' && id.length > 0);
}

const CURSOR_ERROR_BODY_LIMIT = 512;
const SENSITIVE_KEY_RE =
  /api[-_]?key|authorization|cookie|password|secret|token/i;

function sanitizeCursorDiagnostic(value) {
  const serialized =
    typeof value === 'string'
      ? value
      : JSON.stringify(value, (key, nestedValue) =>
          SENSITIVE_KEY_RE.test(key) ? '[REDACTED]' : nestedValue
        );
  return String(serialized ?? '')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/=._-]+/gi, '$1 [REDACTED]')
    .slice(0, CURSOR_ERROR_BODY_LIMIT);
}

async function readCursorResponse(response) {
  if (typeof response.text === 'function') {
    const raw = await response.text();
    try {
      return { body: JSON.parse(raw), raw };
    } catch {
      return { body: {}, raw };
    }
  }
  const body = await response.json().catch(() => ({}));
  return { body, raw: JSON.stringify(body) };
}

function cursorApiError(operation, response, body, raw) {
  const details =
    body?.error && typeof body.error === 'object' ? body.error : body;
  const code = sanitizeCursorDiagnostic(details?.code ?? 'unknown');
  const message = sanitizeCursorDiagnostic(details?.message ?? 'unknown');
  const diagnosticBody = sanitizeCursorDiagnostic(
    body && Object.keys(body).length > 0 ? body : raw
  );
  return new Error(
    `cursor ${operation} failed: ${response.status}; code=${code}; message=${message}; body=${diagnosticBody}`
  );
}

function blockedExecutorIncident() {
  return {
    type: 'fx_safe_executor_unavailable',
    failure: 'fx-safe-executor-unavailable',
    owner: 'CI Platform',
    remedy:
      'provide a GitHub-runner-local executor that returns an exact-head terminal result without pushing, opening a PR, or mutating the queue',
  };
}

function blockedExecutorReceipt({
  repository,
  prNumber,
  headSha,
  fingerprint,
}) {
  return {
    schema: FX_EXECUTION_RECEIPT_SCHEMA,
    status: 'blocked',
    terminal: true,
    outcome: 'executor_unavailable',
    executor: 'cursor-cloud',
    repository,
    prNumber,
    headSha,
    fingerprint,
    agentId: null,
    runId: null,
    result: 'remote_mutation_not_authorized',
    remoteMutationAllowed: false,
  };
}

function terminalizeDispatch(dispatch, receipt) {
  const next = structuredClone(dispatch);
  const fingerprint = receipt.fingerprint;
  const failure = next.state?.failures?.[fingerprint];
  if (failure) {
    failure.terminalReceipt = receipt;
  }
  if (next.state?.claim?.fingerprint === fingerprint) {
    next.state.claim.status = 'terminal';
    next.state.claim.reason = receipt.result;
  }
  next.action = 'terminal_configuration_incident';
  const withoutMarker = String(next.body ?? '')
    .replace(/<!-- jovie-rolling-ci-state:[A-Za-z0-9+/=_-]+ -->/g, '')
    .replace(
      /The one-writer lease is pinned to this exact head\.[\s\S]*?before changing code\./,
      'The repair claim is terminal for this exact head and fingerprint. A new commit or green rerun supersedes it.'
    )
    .trim();
  next.body = `${withoutMarker}\n\n## FX execution terminal\n\n- Status: blocked\n- Reason: \`${receipt.result}\`\n- Owner: CI Platform\n- Next action: install a GitHub-runner-local executor; Cursor Cloud cannot repair repository code without pushing a branch.\n\n<!-- jovie-fx-execution-receipt:${Buffer.from(
    JSON.stringify(receipt)
  ).toString('base64url')} -->\n${rollingCiStateMarker(next.state)}`;
  return next;
}

/**
 * Webhook ingress: missing handoff routes to FX. Pickup-end
 * `resolveRemediationRoute` still keeps the implementer when no receipt.
 * @param {Record<string, any>} [input]
 */
export function resolveWebhookRemediationRoute(input = {}) {
  const {
    receipt = null,
    liveHead,
    implementer,
    fxAdapter = null,
    now,
  } = input;
  if (receipt) {
    const pickup = resolveRemediationRoute({
      receipt,
      liveHead,
      implementer,
      fxAdapter,
      now,
    });
    return pickup.route === 'implementer'
      ? { ...pickup, reason: 'implementer_lease_live' }
      : pickup;
  }

  const adapter = resolveFxAdapter(fxAdapter);
  if (!adapter.name || adapter.authConfigured !== true) {
    return {
      route: 'configuration_incident',
      writer: null,
      reason: 'fx-auth-missing',
      incident: fxConfigurationIncident(),
    };
  }
  return {
    route: 'fx',
    writer: adapter.name,
    failure: FX_HANDOFF_FAILURE,
    reason: 'no_handoff_receipt',
  };
}

function sourcePrWriter(value) {
  return String(value ?? '').trim();
}

function failureLabels(failedJobs = []) {
  const labels = [];
  for (const job of failedJobs) {
    labels.push(String(job?.name ?? ''), String(job?.conclusion ?? ''));
    for (const step of job?.steps ?? []) {
      labels.push(String(step?.name ?? step));
    }
  }
  return labels.filter(Boolean);
}

function failedJobsFrom(input = {}) {
  if (Array.isArray(input.failedJobs) && input.failedJobs.length > 0) {
    return input.failedJobs;
  }
  return (input.dispatch?.events ?? []).map(event => ({
    name: event.check,
    steps: event.failedSteps ?? [],
    conclusion: event.conclusion,
  }));
}

/**
 * Runner-class CI failures are checkout, infra, or flake — not product
 * assertions. Mixed product steps stay on the implementer path.
 *
 * @param {unknown} failedJobs
 * @returns {'checkout' | 'infra' | 'flake' | null}
 */
export function classifyRunnerFailure(failedJobs = []) {
  const jobs = Array.isArray(failedJobs) ? failedJobs : [];
  const labels = failureLabels(jobs);
  if (labels.some(label => PRODUCT_FAILURE_RE.test(label))) return null;
  if (labels.some(label => CHECKOUT_FAILURE_RE.test(label))) return 'checkout';
  if (labels.some(label => FLAKE_FAILURE_RE.test(label))) return 'flake';
  if (labels.some(label => INFRA_FAILURE_RE.test(label))) return 'infra';
  if (
    jobs.some(
      job =>
        job?.conclusion === 'startup_failure' || job?.conclusion === 'timed_out'
    )
  ) {
    return 'infra';
  }
  return null;
}

/** @param {Record<string, any>} [input] */
export function resolveFxNamedOutcome(input = {}) {
  const action = input.launch?.action;
  const reason = String(input.launch?.reason ?? '');
  const dispatchAction = String(input.dispatch?.action ?? '');
  if (action === 'launch_local' || action === 'launch' || action === 'dedup') {
    return 'launched';
  }
  if (action === 'configuration_incident' || reason === 'fx-auth-missing') {
    if (reason === 'fx-safe-executor-unavailable') return 'blocked_executor';
    return 'no_key';
  }
  if (action === 'writer_missing') return 'writer_missing';
  if (action === 'skip' && reason === 'implementer_lease_live') {
    return 'implementer_owned';
  }
  if (
    (action === 'skip' && /stale/.test(reason)) ||
    /stale/.test(dispatchAction)
  ) {
    return 'skipped_stale';
  }
  if (dispatchAction === 'supersede_repairs_green') return 'repaired';
  return 'needs_human';
}

/**
 * Webhook writer for `runDispatch`. merge_group LIVE_AUTHOR can be blank
 * (`gh api pulls/$PR .user.login`). Prefer the source PR author; if still
 * blank, including a live implementer lease with an empty owner, use the
 * adapter name so planning reaches `launch_action` instead of throwing
 * `writer is required`.
 *
 * @param {Record<string, any>} [input]
 */
export function resolveDispatchWriter(input = {}) {
  const { route, priorClaimWriter, implementer } = input;
  const sourceWriter = sourcePrWriter(implementer);
  if (route?.route === 'implementer') {
    return sourcePrWriter(route.writer) || sourceWriter || FX_ADAPTER_NAME;
  }
  if (route?.route === 'fx') {
    const prior = sourcePrWriter(priorClaimWriter);
    if (prior && prior !== FX_ADAPTER_NAME) {
      return prior;
    }
    return sourceWriter || FX_ADAPTER_NAME;
  }
  return sourceWriter || FX_ADAPTER_NAME;
}

/** @param {Record<string, any>} [input] */
export function buildFxPrompt(input = {}) {
  const {
    repository,
    prNumber,
    headSha,
    sourceHead,
    fingerprint,
    failedChecks = [],
    producerEvent,
    runnerClass = null,
    runnerLocal = false,
  } = input;
  const mergeGroup = producerEvent === 'merge_group';
  return [
    mergeGroup
      ? 'Repair the source pull request after a native merge_group CI failure. Do not open a sibling PR.'
      : 'Repair the current pull request at the exact failed head. Do not open a sibling PR.',
    runnerClass
      ? `Runner-class failure (${runnerClass}): checkout, infra, or flake. Remediate the runner/CI wiring at the exact head. Do not change product tests or weaken gates. Idempotency: ${FX_RUNNER_IDEMPOTENCY_KEY}.`
      : '',
    `Repository: ${repository}`,
    `PR: #${prNumber}`,
    mergeGroup
      ? `Failed merge_group head: ${headSha}`
      : `Exact head: ${headSha}`,
    mergeGroup && sourceHead ? `Source PR head: ${sourceHead}` : '',
    `Failure fingerprint: ${fingerprint}`,
    failedChecks.length ? `Failed checks: ${failedChecks.join(', ')}` : '',
    mergeGroup
      ? 'The failure reproduced on the combined queue head versus current main. Fix the source PR so the next merge_group succeeds. Do not waive ratchet growth.'
      : '',
    'Add or update the smallest regression test. Do not skip drafts. Do not merge.',
    runnerLocal
      ? 'You are running on an ephemeral GitHub Actions runner checked out at the source PR head. Read .fx-ci/failure.log for the exact failed-run evidence. Modify and test the working tree only; do not commit, push, open a pull request, merge, or access credentials. The trusted controller performs delivery after independently verifying your diff.'
      : 'Work on the current source pull-request branch at the exact failed head. Add the smallest tested repair; do not open a sibling pull request, merge, or weaken gates.',
    'Do not invent a second fleet hold. Area collision holds only.',
  ]
    .filter(Boolean)
    .join('\n');
}

/** @param {Record<string, any>} [input] */
export function planFxLaunch(input = {}) {
  const {
    repository,
    prNumber,
    headSha,
    sourceHead,
    fingerprint,
    failedChecks = [],
    cursorAgents = [],
    cursorApiKey,
    fxAuthConfigured = false,
    runnerLocalAvailable = false,
    remoteMutationAllowed = false,
    producerEvent,
    runnerClass = null,
  } = input;
  if (runnerLocalAvailable === true) {
    if (fxAuthConfigured !== true) {
      return {
        action: 'configuration_incident',
        reason: 'fx-auth-missing',
        incident: fxConfigurationIncident(),
      };
    }
    return {
      action: 'launch_local',
      reason: 'ci-failed-after-webhook',
      executor: FX_GITHUB_RUNNER_EXECUTOR,
      request: {
        prompt: {
          text: buildFxPrompt({
            repository,
            prNumber,
            headSha,
            sourceHead,
            fingerprint,
            failedChecks,
            producerEvent,
            runnerClass,
            runnerLocal: true,
          }),
        },
        name: `Jovie CI repair ${fingerprint}`.slice(0, 100),
        repository,
        prNumber,
        headSha,
        sourceHead,
        fingerprint,
      },
    };
  }
  if (typeof cursorApiKey !== 'string' || cursorApiKey.trim().length === 0) {
    return {
      action: 'configuration_incident',
      reason: 'fx-auth-missing',
      incident: fxConfigurationIncident(),
    };
  }
  if (remoteMutationAllowed !== true) {
    const receipt = blockedExecutorReceipt({
      repository,
      prNumber,
      headSha,
      fingerprint,
    });
    return {
      action: 'configuration_incident',
      reason: 'fx-safe-executor-unavailable',
      incident: blockedExecutorIncident(),
      receipt,
    };
  }
  const owned = findOwnedAgents(cursorAgents, fingerprint);
  if (owned.length > 0) {
    return {
      action: 'dedup',
      reason: 'agent_already_owns_fingerprint',
      existingAgentIds: owned,
    };
  }
  return {
    action: 'launch',
    reason: 'ci-failed-after-webhook',
    request: {
      prompt: {
        text: buildFxPrompt({
          repository,
          prNumber,
          headSha,
          sourceHead,
          fingerprint,
          failedChecks,
          producerEvent,
          runnerClass,
        }),
      },
      name: `Jovie CI repair ${fingerprint}`.slice(0, 100),
      repos: [
        {
          url: `https://github.com/${repository}`,
          prUrl: `https://github.com/${repository}/pull/${prNumber}`,
        },
      ],
      workOnCurrentBranch: true,
      autoCreatePR: false,
    },
  };
}

/**
 * @param {Record<string, any>} [input]
 * @returns {Record<string, any>}
 */
export function planFxWebhookRemediation(input = {}) {
  const {
    dispatch,
    receipt = null,
    liveHead,
    implementer,
    fxAdapter,
    cursorAgents = [],
    cursorApiKey = '',
    fxAuthConfigured = false,
    runnerLocalAvailable = false,
    remoteMutationAllowed = false,
    now,
    repository,
    prNumber,
    headSha,
    sourceHead,
    headRef,
  } = input;
  const runnerClass = classifyRunnerFailure(
    failedJobsFrom({ ...input, dispatch })
  );
  const route = resolveWebhookRemediationRoute({
    receipt,
    liveHead,
    implementer,
    fxAdapter: fxAdapter ?? {
      name: FX_ADAPTER_NAME,
      authConfigured:
        fxAuthConfigured || Boolean(String(cursorApiKey ?? '').trim()),
    },
    now,
  });
  const action = dispatch?.action ?? '';
  const isFailureDispatch =
    action === 'dispatch_implementer' ||
    action === 'dispatch_superseding_head' ||
    action === 'reject_competing_writer';
  const allowRunnerClassFx = Boolean(runnerClass);

  /**
   * @param {Record<string, any>} result
   * @returns {Record<string, any>}
   */
  const withOutcome = result => {
    const terminalReceipt = result.launch?.receipt;
    const finalizedDispatch = terminalReceipt
      ? terminalizeDispatch(result.dispatch, terminalReceipt)
      : result.dispatch;
    return {
      ...result,
      dispatch: finalizedDispatch,
      runnerClass,
      outcome: resolveFxNamedOutcome({
        launch: result.launch,
        dispatch: finalizedDispatch,
      }),
    };
  };

  if (route.route === 'implementer' && !allowRunnerClassFx) {
    return withOutcome({
      dispatch,
      route,
      launch: { action: 'skip', reason: 'implementer_lease_live' },
    });
  }
  if (route.route === 'configuration_incident') {
    return withOutcome({
      dispatch,
      route,
      launch: {
        action: 'configuration_incident',
        reason: 'fx-auth-missing',
        incident: route.incident,
      },
    });
  }
  if ((route.route !== 'fx' && !allowRunnerClassFx) || !isFailureDispatch) {
    return withOutcome({
      dispatch,
      route,
      launch: { action: 'skip', reason: action || route.route },
    });
  }

  return withOutcome({
    dispatch,
    route,
    launch: planFxLaunch({
      repository: repository ?? dispatch?.events?.[0]?.repository,
      prNumber: prNumber ?? dispatch?.events?.[0]?.pr,
      headSha: headSha ?? liveHead ?? dispatch?.state?.head,
      sourceHead,
      headRef,
      producerEvent: dispatch?.events?.[0]?.source?.producerEvent,
      fingerprint:
        dispatch?.state?.claim?.fingerprint ||
        dispatch?.events?.[0]?.fingerprint ||
        '',
      failedChecks: (dispatch?.events ?? []).map(event => event.check),
      cursorAgents,
      cursorApiKey,
      fxAuthConfigured,
      runnerLocalAvailable,
      remoteMutationAllowed,
      runnerClass,
    }),
  });
}

/** @param {Record<string, any>} [input] */
export async function listCursorAgents(input = {}) {
  const { cursorApiKey, fetchImpl = fetch } = input;
  const response = await fetchImpl(CURSOR_AGENTS_URL, {
    headers: {
      Authorization: cursorAuthHeader(cursorApiKey),
      'Content-Type': 'application/json',
    },
  });
  const { body, raw } = await readCursorResponse(response);
  if (!response.ok) {
    throw cursorApiError('list', response, body, raw);
  }
  return Array.isArray(body?.items) ? body.items : [];
}

/** @param {Record<string, any>} [input] */
export async function launchCursorAgent(input = {}) {
  const { request, cursorApiKey, fetchImpl = fetch } = input;
  const response = await fetchImpl(CURSOR_AGENTS_URL, {
    method: 'POST',
    headers: {
      Authorization: cursorAuthHeader(cursorApiKey),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
  const { body, raw } = await readCursorResponse(response);
  if (!response.ok) {
    throw cursorApiError('launch', response, body, raw);
  }
  if (
    typeof body?.agent?.id !== 'string' ||
    body.agent.id.length === 0 ||
    typeof body?.run?.id !== 'string' ||
    body.run.id.length === 0 ||
    body.run.agentId !== body.agent.id
  ) {
    throw new Error('cursor launch returned no bound agent/run acceptance');
  }
  return body;
}

/**
 * @param {string} path
 * @param {{token: string, method?: string, body?: unknown, fetchImpl?: typeof fetch}} options
 */
async function githubJson(
  path,
  { token, method = 'GET', body = undefined, fetchImpl = fetch }
) {
  const response = await fetchImpl(`https://api.github.com${path}`, {
    method,
    redirect: 'follow',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`GitHub ${method} ${path} returned ${response.status}`);
  }
  return text ? JSON.parse(text) : null;
}

const HOSTED_CANARY_HOLD_LABELS = new Set([
  'hold',
  'gated',
  'incident',
  'needs-conflict-resolution',
  'needs-manual-rebase',
]);
const HOSTED_HA_RECEIPT_CONTEXT = 'ha-ci-remediator-poke';

function classifyHostedCiRunInventory(plan, runs) {
  const workflowRuns = runs?.workflow_runs;
  if (
    !Array.isArray(workflowRuns) ||
    !Number.isSafeInteger(runs?.total_count) ||
    runs.total_count !== workflowRuns.length ||
    workflowRuns.length >= 100 ||
    workflowRuns.some(
      run =>
        !run ||
        typeof run !== 'object' ||
        Array.isArray(run) ||
        !Number.isSafeInteger(run.id) ||
        run.id < 1 ||
        !Number.isSafeInteger(run.run_attempt) ||
        run.run_attempt < 1 ||
        typeof run.name !== 'string' ||
        typeof run.path !== 'string' ||
        run.event !== 'pull_request' ||
        run.head_sha !== plan.expectedHeadOid ||
        typeof run.status !== 'string' ||
        !(run.conclusion === null || typeof run.conclusion === 'string')
    )
  ) {
    return { allowed: false, reason: 'ci-run-inventory-incomplete' };
  }

  const matchingRuns = workflowRuns
    .filter(
      run =>
        run.name === 'CI' &&
        run.path === TRUSTED_CI_WORKFLOW_PATH &&
        run.event === 'pull_request' &&
        run.head_sha === plan.expectedHeadOid
    )
    .sort((left, right) => right.id - left.id);
  const latest = matchingRuns[0];
  if (latest?.conclusion === 'success') {
    return { allowed: false, reason: 'ci-superseded-green' };
  }
  if (
    String(latest?.id ?? '') !== String(plan.workflowRunId) ||
    latest?.run_attempt !== plan.workflowRunAttempt ||
    latest?.status !== 'completed' ||
    latest?.conclusion !== 'failure'
  ) {
    return { allowed: false, reason: 'ci-attempt-stale' };
  }
  return { allowed: true, reason: 'ci-failure-attempt-current' };
}

async function revalidateHostedCiAttempt({ plan, token, request }) {
  const runs = await request(
    `/repos/${plan.repository}/actions/runs?event=pull_request&head_sha=${plan.expectedHeadOid}&per_page=100`,
    { token }
  );
  return classifyHostedCiRunInventory(plan, runs);
}

/**
 * Re-read the live PR and exact-head HA receipt state at a spend/write boundary.
 * The activation values are the workflow's repository-variable snapshot; GitHub's
 * GITHUB_TOKEN cannot read repository variables, so changes require an operator
 * disable-and-drain before changing the selected canary.
 */
export async function revalidateHostedCanaryState({
  plan,
  activationEnabled,
  activationCanaryPr,
  token,
  request = githubJson,
}) {
  assertHostedRepairPlan(plan);
  if (activationEnabled !== 'true') {
    return { allowed: false, reason: 'canary-disabled' };
  }
  if (activationCanaryPr !== String(plan.prNumber)) {
    return { allowed: false, reason: 'canary-pr-mismatch' };
  }
  if (!String(token ?? '').trim()) {
    return { allowed: false, reason: 'github-read-token-missing' };
  }

  const pr = await request(`/repos/${plan.repository}/pulls/${plan.prNumber}`, {
    token,
  });
  if (
    pr?.state !== 'open' ||
    pr?.draft !== false ||
    pr?.base?.ref !== 'main' ||
    pr?.base?.repo?.full_name !== TRUSTED_REPOSITORY ||
    pr?.head?.repo?.full_name !== TRUSTED_REPOSITORY ||
    pr?.head?.repo?.fork === true ||
    pr?.head?.ref !== plan.headRefName ||
    pr?.head?.sha !== plan.expectedHeadOid
  ) {
    return { allowed: false, reason: 'live-pr-or-head-mismatch' };
  }
  const labels = new Set((pr.labels ?? []).map(label => label?.name));
  if ([...HOSTED_CANARY_HOLD_LABELS].some(label => labels.has(label))) {
    return { allowed: false, reason: 'live-pr-hold' };
  }

  const statuses = await request(
    `/repos/${plan.repository}/commits/${plan.expectedHeadOid}/statuses?per_page=100`,
    { token }
  );
  if (!Array.isArray(statuses) || statuses.length >= 100) {
    return { allowed: false, reason: 'ha-receipt-inventory-incomplete' };
  }
  if (
    statuses.some(
      status =>
        status?.context === HOSTED_HA_RECEIPT_CONTEXT &&
        ['success', 'pending'].includes(status?.state)
    )
  ) {
    return { allowed: false, reason: 'ha-remediation-receipt-present' };
  }

  const ciAttempt = await revalidateHostedCiAttempt({ plan, token, request });
  if (!ciAttempt.allowed) return ciAttempt;
  return { allowed: true, reason: 'live-canary-clear' };
}

async function hostedLiveCanaryCommand(args) {
  const plan = readJson(args.plan);
  const result = await revalidateHostedCanaryState({
    plan,
    activationEnabled: process.env.FX_HOSTED_REMEDIATION_ENABLED,
    activationCanaryPr: process.env.FX_HOSTED_REMEDIATION_CANARY_PR,
    token: process.env.GH_TOKEN,
  });
  if (!result.allowed)
    throw new Error(`hosted canary blocked: ${result.reason}`);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

/**
 * Revalidate exact-head PR/CI state, then perform the one atomic writer action.
 */
export async function commitHostedRepair({
  plan,
  acceptance,
  patchBytes,
  fileContents,
  readToken,
  writeToken,
  activationEnabled,
  activationCanaryPr,
  request = githubJson,
}) {
  const variables = buildHostedCommitVariables({
    plan,
    acceptance,
    patchBytes,
    fileContents,
  });
  const canaryState = await revalidateHostedCanaryState({
    plan,
    activationEnabled,
    activationCanaryPr,
    token: readToken,
    request,
  });
  if (!canaryState.allowed) {
    if (canaryState.reason === 'ci-superseded-green') {
      return { committed: false, outcome: 'superseded_green' };
    }
    return {
      committed: false,
      outcome: 'stale_head',
      blockedBy: canaryState.reason,
    };
  }

  const response = await request('/graphql', {
    token: writeToken,
    method: 'POST',
    body: { query: CREATE_HOSTED_COMMIT_MUTATION, variables },
  });
  if (Array.isArray(response?.errors) && response.errors.length > 0) {
    throw new Error('GitHub atomic expected-head update was rejected');
  }
  const commit = response?.data?.createCommitOnBranch?.commit;
  assertExactSha(commit?.oid, 'committedHeadOid');
  return {
    committed: true,
    outcome: 'repaired',
    committedHeadOid: commit.oid,
    url: commit.url ?? null,
  };
}

function cliArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error('CLI arguments must be --name value pairs');
    }
    parsed[key.slice(2)] = value;
  }
  return parsed;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function hostedPlanCommand(args) {
  const input = readJson(args.input);
  const plan = buildHostedRepairPlan({
    dispatch: input.dispatch,
    headRefName: input.headRefName,
    baseSha: input.baseSha,
    changedFiles: input.changedFiles,
  });
  writeJson(args.output, plan);
  process.stdout.write(`${JSON.stringify(plan)}\n`);
}

function hostedTestPlanCommand(args) {
  const result = buildHostedTestPlan({
    plan: readJson(args.plan),
    patchBytes: readFileSync(args.patch),
    changes: readJson(args.changes),
    repository: args.repository,
    testCommitOid: args['test-commit'],
  });
  writeJson(args.output, result);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

function hostedPrelaunchCommand(args) {
  const receipt = buildHostedPrelaunchReceipt({ plan: readJson(args.plan) });
  writeJson(args.output, receipt);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

function hostedStageCommand(args) {
  const plan = assertHostedRepairPlan(readJson(args.plan));
  const repository = args.repository;
  const currentHead = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repository,
    encoding: 'utf8',
  }).trim();
  if (currentHead !== plan.expectedHeadOid) {
    throw new Error('candidate checkout is not the exact planned head');
  }
  const rawStatus = execFileSync(
    'git',
    ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
    { cwd: repository }
  ).toString('utf8');
  const records = rawStatus.split('\0').filter(Boolean);
  const paths = records.map(record => {
    if (record.slice(0, 2) !== ' M' || record[2] !== ' ') {
      throw new Error(`unsafe candidate git transition: ${record.slice(0, 2)}`);
    }
    return record.slice(3);
  });
  const changes = validateHostedChanges(
    paths.map(path => {
      const fullPath = join(repository, path);
      const stat = lstatSync(fullPath);
      if (stat.isSymbolicLink()) {
        throw new Error(`${path}: symlink repair is forbidden`);
      }
      const bytes = readFileSync(fullPath);
      return {
        path,
        status: 'M',
        symlink: false,
        bytes: bytes.length,
        sha256: sha256(bytes),
      };
    })
  );
  if (changes.some(change => !plan.allowedPaths.includes(change.path))) {
    throw new Error('repair changed a path outside the exact PR diff');
  }
  const patchBytes = execFileSync(
    'git',
    ['diff', '--binary', '--no-ext-diff', 'HEAD', '--', ...paths],
    { cwd: repository, maxBuffer: HOSTED_REPAIR_MAX_PATCH_BYTES + 1 }
  );
  if (
    patchBytes.length < 1 ||
    patchBytes.length > HOSTED_REPAIR_MAX_PATCH_BYTES
  ) {
    throw new Error('hosted repair patch is empty or exceeds the byte limit');
  }
  mkdirSync(args.output, { recursive: true });
  writeFileSync(join(args.output, 'repair.patch'), patchBytes, { mode: 0o600 });
  writeJson(join(args.output, 'changes.json'), changes);
  writeJson(join(args.output, 'plan.json'), plan);
  for (const change of changes) {
    const destination = join(args.output, 'files', change.path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, readFileSync(join(repository, change.path)), {
      mode: 0o600,
    });
  }
  process.stdout.write(
    `${JSON.stringify({ staged: true, changedFiles: changes.map(change => change.path) })}\n`
  );
}

function hostedAcceptanceCommand(args) {
  const plan = readJson(args.plan);
  const patchBytes = readFileSync(args.patch);
  const changes = readJson(args.changes);
  const repository = args.repository;
  const trustedTestPlan = buildHostedTestPlan({
    plan,
    patchBytes,
    changes,
    repository,
    testCommitOid: args['verification-commit'],
  });
  if (trustedTestPlan.testTreeSha !== args['test-tree']) {
    throw new Error('recreated candidate tree differs from the tested tree');
  }
  const testReportBytes = readFileSync(args['test-report']);
  let coverageBytes = null;
  let coverageResult = { applicable: false, ok: true };
  if (trustedTestPlan.coveragePlan.applicable) {
    coverageBytes = readFileSync(args.coverage);
    coverageResult = runChangedLineCoverageCheck({
      base: plan.baseSha,
      head: args['verification-commit'],
      coveragePath: args.coverage,
      repoRoot: repository,
    });
  } else if (existsSync(args.coverage)) {
    throw new Error('coverage report is unexpected for this exact tree');
  }
  const receipt = buildHostedAcceptanceReceipt({
    plan,
    patchBytes,
    changes,
    executor: readJson(args.executor),
    trustedTestPlan,
    testReportBytes,
    coverageBytes,
    workflowRunId: args['run-id'],
    workflowRunAttempt: Number(args['run-attempt']),
    patchArtifactId: args['patch-artifact-id'],
    testArtifactId: args['test-artifact-id'],
    expectedTestCommitOid: args['test-commit'],
    expectedTestTreeSha: args['test-tree'],
    coverageResult,
    repository,
  });
  writeJson(args.output, receipt);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

async function hostedCommitCommand(args) {
  const plan = readJson(args.plan);
  const acceptance = readJson(args.acceptance);
  const fileContents = Object.fromEntries(
    acceptance.changedFiles.map(change => [
      change.path,
      readFileSync(join(args.files, change.path)),
    ])
  );
  const result = await commitHostedRepair({
    plan,
    acceptance,
    patchBytes: readFileSync(args.patch),
    fileContents,
    readToken: process.env.STATUS_TOKEN,
    writeToken: process.env.GH_TOKEN,
    activationEnabled: process.env.FX_HOSTED_REMEDIATION_ENABLED,
    activationCanaryPr: process.env.FX_HOSTED_REMEDIATION_CANARY_PR,
  });
  const terminal = buildHostedTerminalReceipt({
    plan,
    outcome: result.outcome,
    committedHeadOid: result.committedHeadOid ?? null,
    acceptance,
  });
  writeJson(args.output, terminal);
  process.stdout.write(`${JSON.stringify({ ...result, terminal })}\n`);
}

function hostedTerminalCommand(args) {
  const receipt = buildHostedTerminalReceipt({
    plan: readJson(args.plan),
    outcome: args.outcome,
    committedHeadOid: args['committed-head'] ?? null,
    acceptance: args.acceptance ? readJson(args.acceptance) : null,
  });
  writeJson(args.output, receipt);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function main() {
  const command = process.argv[2];
  if (command?.startsWith('hosted-')) {
    const args = cliArgs(process.argv.slice(3));
    if (command === 'hosted-plan') return hostedPlanCommand(args);
    if (command === 'hosted-test-plan') return hostedTestPlanCommand(args);
    if (command === 'hosted-prelaunch') return hostedPrelaunchCommand(args);
    if (command === 'hosted-stage') return hostedStageCommand(args);
    if (command === 'hosted-live-canary') return hostedLiveCanaryCommand(args);
    if (command === 'hosted-acceptance') return hostedAcceptanceCommand(args);
    if (command === 'hosted-commit') return hostedCommitCommand(args);
    if (command === 'hosted-terminal') return hostedTerminalCommand(args);
    throw new Error(`unknown hosted remediation command: ${command}`);
  }
  const input = await readInput();
  const receipt =
    input.receipt ??
    parseHandoffReceipt(input.handoffCommentBody ?? '') ??
    null;
  const cursorApiKey = input.cursorApiKey ?? process.env.CURSOR_API_KEY ?? '';
  const fxAuthConfigured =
    input.fxAuthConfigured === true ||
    Boolean(String(process.env.AI_GATEWAY_API_KEY ?? '').trim());
  let cursorAgents = Array.isArray(input.cursorAgents)
    ? input.cursorAgents
    : [];
  if (
    input.remoteMutationAllowed === true &&
    cursorApiKey &&
    cursorAgents.length === 0 &&
    input.listCursorAgents !== false
  ) {
    try {
      cursorAgents = await listCursorAgents({ cursorApiKey });
    } catch {
      cursorAgents = [];
    }
  }
  const route = resolveWebhookRemediationRoute({
    receipt,
    liveHead: input.liveHead,
    implementer: input.writer,
    fxAdapter: input.fxAdapter ?? {
      name: FX_ADAPTER_NAME,
      authConfigured: fxAuthConfigured || Boolean(String(cursorApiKey).trim()),
    },
    now: input.now,
  });
  const priorClaimWriter =
    input.priorClaimWriter ||
    parseRollingCiState(input.priorCommentBody)?.claim?.writer;
  const writer = resolveDispatchWriter({
    route,
    priorClaimWriter,
    implementer: input.writer,
  });
  const runnerClass = classifyRunnerFailure(input.failedJobs);
  let dispatch;
  try {
    dispatch = runDispatch({ ...input, writer });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'writer is required') {
      const result = {
        route,
        runnerClass,
        dispatch: { action: 'writer_missing', mutate: false },
        launch: { action: 'writer_missing', reason: 'writer is required' },
        outcome: 'writer_missing',
      };
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return;
    }
    throw error;
  }
  const result = planFxWebhookRemediation({
    dispatch,
    receipt,
    liveHead: input.liveHead,
    implementer: input.writer,
    fxAdapter: input.fxAdapter,
    cursorAgents,
    cursorApiKey,
    fxAuthConfigured,
    runnerLocalAvailable: input.runnerLocalAvailable === true,
    remoteMutationAllowed: input.remoteMutationAllowed === true,
    now: input.now,
    repository: input.repository,
    prNumber: input.prNumber,
    headSha: input.headSha,
    sourceHead: input.sourceHead,
    headRef: input.headRef,
    failedJobs: input.failedJobs,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
