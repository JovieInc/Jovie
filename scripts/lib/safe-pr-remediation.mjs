#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

export const PLAN_SCHEMA = 'jovie-safe-pr-remediation/v1';
export const RECEIPT_SCHEMA = 'jovie-safe-pr-remediation-receipt/v1';
export const REMEDIATION_CONTEXT = 'jovie-safe-remediation/v1';
export const TARGET_PACKAGE_PATH = 'apps/eve-pilot/package.json';
export const TARGET_LOCKFILE_PATH = 'apps/eve-pilot/pnpm-lock.yaml';
export const EVE_KIND = 'eve-isolated-lockfile';
// Root workspace lane: Dependabot sometimes bumps a workspace manifest without
// regenerating the root pnpm-lock.yaml (PR #18250). Only the lockfile is ever
// written; package.json (including pnpm.overrides) is never modified here.
export const ROOT_KIND = 'root-workspace-lockfile';
export const ROOT_LOCKFILE_PATH = 'pnpm-lock.yaml';
export const ROOT_WORKFLOW_NAME = 'CI';
const MAX_ROOT_MANIFESTS = 20;
const MAX_ROOT_FAILED_JOB_LOGS = 8;
const OUTDATED_ROOT_LOCKFILE_RE =
  /pnpm-lock\.yaml is not up to date with <ROOT>\/(?:[A-Za-z0-9@._-]+\/)*package\.json/;
const LOCKFILE_CONFIG_MISMATCH_RE = /ERR_PNPM_LOCKFILE_CONFIG_MISMATCH/;

const REQUIRED_LABELS = new Set(['automated', 'dependencies']);
const HARD_HOLD_LABELS = new Set([
  'fast',
  'gated',
  'hold',
  'incident',
  'needs-conflict-resolution',
  'needs-manual-rebase',
  'queue-deferred',
]);
const TEST_COMMANDS = Object.freeze([
  'pnpm install --ignore-workspace --frozen-lockfile --ignore-scripts',
  'pnpm run typecheck',
  'pnpm run test',
  'pnpm run build',
]);
const ROOT_TEST_COMMANDS = Object.freeze([
  'pnpm install --frozen-lockfile --lockfile-only --ignore-scripts --ignore-pnpmfile',
  'node scripts/lockfile-specifier-preflight.mjs',
]);
const DEPENDENCY_SECTIONS = Object.freeze([
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
]);
const CREATE_COMMIT_MUTATION = `mutation SafeRemediationCommit($input: CreateCommitOnBranchInput!) {
  createCommitOnBranch(input: $input) {
    commit { oid url }
  }
}`;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function labelsOf(pr) {
  return new Set((pr?.labels ?? []).map(label => label?.name).filter(Boolean));
}

function registrySemverSpecifier(value) {
  return (
    typeof value === 'string' &&
    /^(?:[~^]|>=?|<=?)?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
      value
    )
  );
}

export function classifyDependencyManifestChange({
  baseBytes,
  headBytes,
  path = TARGET_PACKAGE_PATH,
}) {
  let base;
  let head;
  try {
    base = JSON.parse(baseBytes.toString('utf8'));
    head = JSON.parse(headBytes.toString('utf8'));
  } catch {
    return { valid: false, reason: 'manifest-not-json' };
  }
  const basePolicy = structuredClone(base);
  const headPolicy = structuredClone(head);
  for (const section of DEPENDENCY_SECTIONS) {
    delete basePolicy[section];
    delete headPolicy[section];
  }
  if (!isDeepStrictEqual(basePolicy, headPolicy))
    return { valid: false, reason: 'manifest-policy-field-changed' };

  const changes = [];
  for (const section of DEPENDENCY_SECTIONS) {
    const before = base[section] ?? {};
    const after = head[section] ?? {};
    if (
      typeof before !== 'object' ||
      Array.isArray(before) ||
      typeof after !== 'object' ||
      Array.isArray(after) ||
      !isDeepStrictEqual(Object.keys(before).sort(), Object.keys(after).sort())
    )
      return { valid: false, reason: 'dependency-key-set-changed' };
    for (const name of Object.keys(before).sort()) {
      if (before[name] === after[name]) continue;
      if (
        !registrySemverSpecifier(before[name]) ||
        !registrySemverSpecifier(after[name])
      )
        return { valid: false, reason: 'non-registry-semver-change' };
      changes.push({ section, name, before: before[name], after: after[name] });
    }
  }
  if (changes.length === 0)
    return { valid: false, reason: 'no-dependency-version-change' };
  return {
    valid: true,
    evidence: {
      path,
      baseSha256: sha256(baseBytes),
      headSha256: sha256(headBytes),
      changes,
    },
  };
}

function allowedDependencyFile(path) {
  return (
    path === 'CHANGELOG.md' ||
    path === 'pnpm-lock.yaml' ||
    path === 'apps/eve-pilot/pnpm-lock.yaml' ||
    path === 'package.json' ||
    /(^|\/)package\.json$/.test(path)
  );
}

function validatePrIdentity({
  pr,
  files,
  repository,
  expectedHeadOid,
  expectedBaseOid = undefined,
  kind = EVE_KIND,
}) {
  if (!pr || !Array.isArray(files) || files.length === 0)
    return 'missing-pr-evidence';
  if (pr.state !== 'open' || pr.draft === true) return 'pr-not-open-ready';
  if (pr.user?.login !== 'dependabot[bot]') return 'author-not-dependabot';
  if (
    pr.base?.ref !== 'main' ||
    pr.base?.repo?.full_name !== repository ||
    pr.head?.repo?.full_name !== repository ||
    pr.head?.repo?.fork === true
  )
    return 'unsafe-repository-boundary';
  if (pr.head?.sha !== expectedHeadOid) return 'head-drift';
  if (!/^[0-9a-f]{40}$/.test(expectedHeadOid ?? '')) return 'invalid-head';
  if (!/^[0-9a-f]{40}$/.test(pr.base?.sha ?? '')) return 'invalid-base';
  if (expectedBaseOid !== undefined && pr.base.sha !== expectedBaseOid)
    return 'base-drift';
  const labels = labelsOf(pr);
  if ([...HARD_HOLD_LABELS].some(label => labels.has(label)))
    return 'hard-hold';
  if ([...REQUIRED_LABELS].some(label => !labels.has(label)))
    return 'missing-dependency-label';
  if (files.some(path => !allowedDependencyFile(path)))
    return 'non-dependency-file-changed';
  if (kind === ROOT_KIND) {
    const manifestCount = files.filter(isManifestPath).length;
    if (manifestCount === 0) return 'no-manifest-changed';
    if (manifestCount > MAX_ROOT_MANIFESTS) return 'too-many-manifests';
    if (files.includes(ROOT_LOCKFILE_PATH))
      return 'root-lockfile-already-changed';
    return null;
  }
  if (kind !== EVE_KIND) return 'unknown-kind';
  if (!files.includes(TARGET_PACKAGE_PATH)) return 'eve-manifest-not-changed';
  if (files.includes(TARGET_LOCKFILE_PATH))
    return 'eve-lockfile-already-changed';
  return null;
}

function isManifestPath(path) {
  return /(^|\/)package\.json$/.test(path);
}

export function classifyEveLockDrift({
  workflowRun,
  pr,
  files,
  failedJobs,
  repository,
  manifestEvidence,
}) {
  if (
    workflowRun?.name !== 'Eve Pilot' ||
    workflowRun?.conclusion !== 'failure' ||
    workflowRun?.event !== 'pull_request' ||
    workflowRun?.head_sha !== pr?.head?.sha ||
    workflowRun?.pull_requests?.length !== 1 ||
    workflowRun.pull_requests[0]?.number !== pr?.number
  )
    return { eligible: false, reason: 'workflow-identity-mismatch' };

  const identityFailure = validatePrIdentity({
    pr,
    files,
    repository,
    expectedHeadOid: workflowRun.head_sha,
  });
  if (identityFailure) return { eligible: false, reason: identityFailure };
  if (!manifestEvidence?.valid)
    return {
      eligible: false,
      reason: manifestEvidence?.reason ?? 'manifest-evidence-missing',
    };

  const failedJob = (failedJobs ?? []).find(
    job =>
      job?.name === 'Verify isolated Eve pilot' &&
      job?.conclusion === 'failure' &&
      /ERR_PNPM_OUTDATED_LOCKFILE/.test(job?.log ?? '') &&
      /pnpm-lock\.yaml is not up to date with <ROOT>\/package\.json/.test(
        job?.log ?? ''
      )
  );
  if (!failedJob) return { eligible: false, reason: 'failure-not-allowlisted' };

  return {
    eligible: true,
    plan: {
      schema: PLAN_SCHEMA,
      kind: EVE_KIND,
      repository,
      prNumber: pr.number,
      expectedHeadOid: workflowRun.head_sha,
      baseOid: pr.base.sha,
      headRefName: pr.head.ref,
      workflowRunId: workflowRun.id,
      failedJobId: failedJob.id,
      packagePath: TARGET_PACKAGE_PATH,
      lockfilePath: TARGET_LOCKFILE_PATH,
      changedFiles: [...files].sort(),
      manifestEvidence: manifestEvidence.evidence,
    },
  };
}

/**
 * Root workspace lockfile drift. The overrides/config mismatch is refused
 * with an explicit reason: pnpm.overrides is a deliberate pin, so the lane
 * never regenerates a lockfile to agree with a Dependabot-edited override.
 */
export function classifyRootLockDrift({
  workflowRun,
  pr,
  files,
  failedJobs,
  repository,
  manifestEvidence,
}) {
  if (
    workflowRun?.name !== ROOT_WORKFLOW_NAME ||
    workflowRun?.conclusion !== 'failure' ||
    workflowRun?.event !== 'pull_request' ||
    workflowRun?.head_sha !== pr?.head?.sha ||
    workflowRun?.pull_requests?.length !== 1 ||
    workflowRun.pull_requests[0]?.number !== pr?.number
  )
    return { eligible: false, reason: 'workflow-identity-mismatch' };
  if (pr?.user?.login !== 'dependabot[bot]')
    return { eligible: false, reason: 'author-not-dependabot' };
  if (
    (failedJobs ?? []).some(job =>
      LOCKFILE_CONFIG_MISMATCH_RE.test(job?.log ?? '')
    )
  )
    return { eligible: false, reason: 'lockfile-config-mismatch' };

  const identityFailure = validatePrIdentity({
    pr,
    files,
    repository,
    expectedHeadOid: workflowRun.head_sha,
    kind: ROOT_KIND,
  });
  if (identityFailure) return { eligible: false, reason: identityFailure };

  const manifestPaths = files.filter(isManifestPath).sort();
  const evidence = Array.isArray(manifestEvidence) ? manifestEvidence : [];
  const invalid = evidence.find(entry => !entry?.valid);
  if (invalid)
    return {
      eligible: false,
      reason: invalid?.reason ?? 'manifest-evidence-missing',
    };
  if (
    evidence.length !== manifestPaths.length ||
    evidence.some(
      (entry, index) => entry.evidence?.path !== manifestPaths[index]
    )
  )
    return { eligible: false, reason: 'manifest-evidence-missing' };

  const failedJob = (failedJobs ?? []).find(
    job =>
      job?.conclusion === 'failure' &&
      Number.isInteger(job?.id) &&
      /ERR_PNPM_OUTDATED_LOCKFILE/.test(job?.log ?? '') &&
      OUTDATED_ROOT_LOCKFILE_RE.test(job?.log ?? '')
  );
  if (!failedJob) return { eligible: false, reason: 'failure-not-allowlisted' };

  return {
    eligible: true,
    plan: {
      schema: PLAN_SCHEMA,
      kind: ROOT_KIND,
      repository,
      prNumber: pr.number,
      expectedHeadOid: workflowRun.head_sha,
      baseOid: pr.base.sha,
      headRefName: pr.head.ref,
      workflowRunId: workflowRun.id,
      failedJobId: failedJob.id,
      lockfilePath: ROOT_LOCKFILE_PATH,
      changedFiles: [...files].sort(),
      manifestEvidence: evidence.map(entry => entry.evidence),
    },
  };
}

function validManifestEvidenceEntry(entry, expectedPath) {
  return (
    entry?.path === expectedPath &&
    /^[0-9a-f]{64}$/.test(entry.baseSha256 ?? '') &&
    /^[0-9a-f]{64}$/.test(entry.headSha256 ?? '') &&
    Array.isArray(entry.changes) &&
    entry.changes.length > 0
  );
}

function validRootPlanBody(plan) {
  if (!Array.isArray(plan.changedFiles)) return false;
  const manifestPaths = plan.changedFiles.filter(isManifestPath).sort();
  return (
    plan.lockfilePath === ROOT_LOCKFILE_PATH &&
    plan.packagePath === undefined &&
    manifestPaths.length > 0 &&
    manifestPaths.length <= MAX_ROOT_MANIFESTS &&
    !plan.changedFiles.includes(ROOT_LOCKFILE_PATH) &&
    !plan.changedFiles.some(path => !allowedDependencyFile(path)) &&
    Array.isArray(plan.manifestEvidence) &&
    plan.manifestEvidence.length === manifestPaths.length &&
    plan.manifestEvidence.every((entry, index) =>
      validManifestEvidenceEntry(entry, manifestPaths[index])
    )
  );
}

function validPlanEnvelope({
  plan,
  expectedRepository,
  expectedWorkflowRunId,
}) {
  return (
    plan?.schema === PLAN_SCHEMA &&
    plan.repository === expectedRepository &&
    plan.workflowRunId === expectedWorkflowRunId &&
    Number.isInteger(plan.prNumber) &&
    plan.prNumber > 0 &&
    Number.isInteger(plan.failedJobId) &&
    plan.failedJobId > 0 &&
    /^[0-9a-f]{40}$/.test(plan.expectedHeadOid ?? '') &&
    /^[0-9a-f]{40}$/.test(plan.baseOid ?? '') &&
    typeof plan.headRefName === 'string' &&
    plan.headRefName.length > 0
  );
}

export function validatePlanAuthority({
  plan,
  expectedRepository,
  expectedWorkflowRunId,
}) {
  if (plan?.kind === ROOT_KIND)
    return validPlanEnvelope({
      plan,
      expectedRepository,
      expectedWorkflowRunId,
    }) && validRootPlanBody(plan)
      ? { valid: true }
      : { valid: false, reason: 'invalid-plan-authority' };
  if (
    plan?.schema !== PLAN_SCHEMA ||
    plan.kind !== EVE_KIND ||
    plan.repository !== expectedRepository ||
    plan.workflowRunId !== expectedWorkflowRunId ||
    !Number.isInteger(plan.prNumber) ||
    plan.prNumber <= 0 ||
    !Number.isInteger(plan.failedJobId) ||
    plan.failedJobId <= 0 ||
    !/^[0-9a-f]{40}$/.test(plan.expectedHeadOid ?? '') ||
    !/^[0-9a-f]{40}$/.test(plan.baseOid ?? '') ||
    typeof plan.headRefName !== 'string' ||
    plan.headRefName.length === 0 ||
    plan.packagePath !== TARGET_PACKAGE_PATH ||
    plan.lockfilePath !== TARGET_LOCKFILE_PATH ||
    !Array.isArray(plan.changedFiles) ||
    !plan.changedFiles.includes(TARGET_PACKAGE_PATH) ||
    plan.changedFiles.includes(TARGET_LOCKFILE_PATH) ||
    plan.changedFiles.some(path => !allowedDependencyFile(path)) ||
    plan.manifestEvidence?.path !== TARGET_PACKAGE_PATH ||
    !/^[0-9a-f]{64}$/.test(plan.manifestEvidence?.baseSha256 ?? '') ||
    !/^[0-9a-f]{64}$/.test(plan.manifestEvidence?.headSha256 ?? '') ||
    !Array.isArray(plan.manifestEvidence?.changes) ||
    plan.manifestEvidence.changes.length === 0
  )
    return { valid: false, reason: 'invalid-plan-authority' };
  return { valid: true };
}

/**
 * @param {{plan: any, packageBytes?: Buffer, lockfileBytes: Buffer}} input
 *   packageBytes is required for the Eve lane only; the root lane binds every
 *   manifest through the plan's hashed evidence instead.
 */
export function buildRemediationReceipt({ plan, packageBytes, lockfileBytes }) {
  const authority = validatePlanAuthority({
    plan,
    expectedRepository: plan?.repository,
    expectedWorkflowRunId: plan?.workflowRunId,
  });
  if (!authority.valid) throw new Error('invalid remediation plan');
  if (plan.kind === ROOT_KIND)
    return {
      schema: RECEIPT_SCHEMA,
      kind: ROOT_KIND,
      planSha256: sha256(Buffer.from(JSON.stringify(plan))),
      repository: plan.repository,
      prNumber: plan.prNumber,
      expectedHeadOid: plan.expectedHeadOid,
      workflowRunId: plan.workflowRunId,
      lockfileSha256: sha256(lockfileBytes),
      testCommands: [...ROOT_TEST_COMMANDS],
    };
  return {
    schema: RECEIPT_SCHEMA,
    planSha256: sha256(Buffer.from(JSON.stringify(plan))),
    repository: plan.repository,
    prNumber: plan.prNumber,
    expectedHeadOid: plan.expectedHeadOid,
    workflowRunId: plan.workflowRunId,
    packageSha256: sha256(packageBytes),
    lockfileSha256: sha256(lockfileBytes),
    testCommands: [...TEST_COMMANDS],
  };
}

export function validateRemediationArtifact({
  plan,
  freshPr,
  freshFiles,
  receipt,
  packageBytes,
  freshBasePackageBytes,
  freshPackageBytes,
  lockfileBytes,
  expectedRepository,
  expectedWorkflowRunId,
}) {
  const authority = validatePlanAuthority({
    plan,
    expectedRepository,
    expectedWorkflowRunId,
  });
  if (!authority.valid || receipt?.schema !== RECEIPT_SCHEMA)
    return { valid: false, reason: 'invalid-schema' };
  const identityFailure = validatePrIdentity({
    pr: freshPr,
    files: freshFiles,
    repository: plan.repository,
    expectedHeadOid: plan.expectedHeadOid,
    expectedBaseOid: plan.baseOid,
  });
  if (identityFailure) return { valid: false, reason: identityFailure };
  if (
    freshPr.number !== plan.prNumber ||
    freshPr.head?.ref !== plan.headRefName ||
    JSON.stringify([...freshFiles].sort()) !== JSON.stringify(plan.changedFiles)
  )
    return { valid: false, reason: 'pr-evidence-drift' };
  if (
    receipt.planSha256 !== sha256(Buffer.from(JSON.stringify(plan))) ||
    receipt.repository !== plan.repository ||
    receipt.prNumber !== plan.prNumber ||
    receipt.expectedHeadOid !== plan.expectedHeadOid ||
    receipt.workflowRunId !== plan.workflowRunId
  )
    return { valid: false, reason: 'receipt-identity-mismatch' };
  if (receipt.packageSha256 !== sha256(packageBytes))
    return { valid: false, reason: 'package-hash-mismatch' };
  if (
    !freshBasePackageBytes ||
    sha256(freshBasePackageBytes) !== plan.manifestEvidence.baseSha256 ||
    plan.manifestEvidence.headSha256 !== sha256(packageBytes) ||
    !freshPackageBytes ||
    sha256(freshPackageBytes) !== plan.manifestEvidence.headSha256 ||
    !packageBytes.equals(freshPackageBytes)
  )
    return { valid: false, reason: 'fresh-package-mismatch' };
  if (receipt.lockfileSha256 !== sha256(lockfileBytes))
    return { valid: false, reason: 'lockfile-hash-mismatch' };
  if (JSON.stringify(receipt.testCommands) !== JSON.stringify(TEST_COMMANDS))
    return { valid: false, reason: 'test-receipt-mismatch' };
  if (lockfileBytes.length === 0)
    return { valid: false, reason: 'empty-lockfile' };
  return { valid: true };
}

/**
 * @param {{
 *   plan: any;
 *   freshPr: any;
 *   freshFiles: string[];
 *   receipt: any;
 *   freshManifests: Array<{path: string, baseBytes: Buffer, headBytes: Buffer}>;
 *   lockfileBytes: Buffer;
 *   expectedRepository: string;
 *   expectedWorkflowRunId: number;
 * }} input
 */
export function validateRootRemediationArtifact({
  plan,
  freshPr,
  freshFiles,
  receipt,
  freshManifests,
  lockfileBytes,
  expectedRepository,
  expectedWorkflowRunId,
}) {
  const authority = validatePlanAuthority({
    plan,
    expectedRepository,
    expectedWorkflowRunId,
  });
  if (
    !authority.valid ||
    plan.kind !== ROOT_KIND ||
    receipt?.schema !== RECEIPT_SCHEMA ||
    receipt.kind !== ROOT_KIND
  )
    return { valid: false, reason: 'invalid-schema' };
  const identityFailure = validatePrIdentity({
    pr: freshPr,
    files: freshFiles,
    repository: plan.repository,
    expectedHeadOid: plan.expectedHeadOid,
    expectedBaseOid: plan.baseOid,
    kind: ROOT_KIND,
  });
  if (identityFailure) return { valid: false, reason: identityFailure };
  if (
    freshPr.number !== plan.prNumber ||
    freshPr.head?.ref !== plan.headRefName ||
    JSON.stringify([...freshFiles].sort()) !== JSON.stringify(plan.changedFiles)
  )
    return { valid: false, reason: 'pr-evidence-drift' };
  if (
    receipt.planSha256 !== sha256(Buffer.from(JSON.stringify(plan))) ||
    receipt.repository !== plan.repository ||
    receipt.prNumber !== plan.prNumber ||
    receipt.expectedHeadOid !== plan.expectedHeadOid ||
    receipt.workflowRunId !== plan.workflowRunId
  )
    return { valid: false, reason: 'receipt-identity-mismatch' };
  const manifests = new Map(
    (freshManifests ?? []).map(entry => [entry.path, entry])
  );
  for (const expected of plan.manifestEvidence) {
    const fresh = manifests.get(expected.path);
    if (
      !fresh?.baseBytes ||
      !fresh?.headBytes ||
      sha256(fresh.baseBytes) !== expected.baseSha256 ||
      sha256(fresh.headBytes) !== expected.headSha256
    )
      return { valid: false, reason: 'fresh-package-mismatch' };
  }
  if (receipt.lockfileSha256 !== sha256(lockfileBytes))
    return { valid: false, reason: 'lockfile-hash-mismatch' };
  if (
    JSON.stringify(receipt.testCommands) !== JSON.stringify(ROOT_TEST_COMMANDS)
  )
    return { valid: false, reason: 'test-receipt-mismatch' };
  if (lockfileBytes.length === 0)
    return { valid: false, reason: 'empty-lockfile' };
  return { valid: true };
}

export function buildCreateCommitVariables({ plan, receipt, lockfileBytes }) {
  const authority = validatePlanAuthority({
    plan,
    expectedRepository: plan?.repository,
    expectedWorkflowRunId: plan?.workflowRunId,
  });
  if (!authority.valid || receipt?.schema !== RECEIPT_SCHEMA)
    throw new Error('invalid remediation authority');
  return {
    input: {
      branch: {
        repositoryNameWithOwner: plan.repository,
        branchName: plan.headRefName,
      },
      expectedHeadOid: plan.expectedHeadOid,
      message: {
        headline:
          plan.kind === ROOT_KIND
            ? 'fix(deps): refresh root lockfile'
            : 'fix(eve): refresh isolated lockfile',
        body: `GitHub Actions safe remediation for PR #${plan.prNumber}.\n\nReceipt: ${REMEDIATION_CONTEXT}\nSource workflow run: ${plan.workflowRunId}`,
      },
      fileChanges: {
        additions: [
          {
            path:
              plan.kind === ROOT_KIND
                ? ROOT_LOCKFILE_PATH
                : TARGET_LOCKFILE_PATH,
            contents: lockfileBytes.toString('base64'),
          },
        ],
      },
    },
  };
}

/**
 * @param {string} path
 * @param {{token: string, method?: string, body?: unknown}} options
 */
async function githubRequest(path, { token, method = 'GET', body }) {
  const response = await fetch(`https://api.github.com${path}`, {
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
  if (!response.ok)
    throw new Error(`GitHub ${method} ${path} returned ${response.status}`);
  if (!text) return null;
  const contentType = response.headers.get('content-type') ?? '';
  return contentType.includes('json') ? JSON.parse(text) : text;
}

/**
 * GitHub can acknowledge createCommitOnBranch before the pull-request REST
 * read model exposes the new head. Retry only that read-only propagation gap;
 * any missing or third head still fails closed immediately.
 *
 * @param {{
 *   repository: string;
 *   prNumber: number;
 *   previousHeadOid: string;
 *   committedHeadOid: string;
 *   token: string;
 *   request?: (path: string, options: {token: string}) => Promise<any>;
 *   sleep?: (delayMs: number) => Promise<void>;
 *   delaysMs?: number[];
 * }} options
 */
export async function waitForCommittedPrHead({
  repository,
  prNumber,
  previousHeadOid,
  committedHeadOid,
  token,
  request = githubRequest,
  sleep = delayMs =>
    new Promise(resolve => {
      setTimeout(resolve, delayMs);
    }),
  delaysMs = [1000, 2000, 4000, 8000],
}) {
  for (let readIndex = 0; readIndex <= delaysMs.length; readIndex += 1) {
    const readback = await request(`/repos/${repository}/pulls/${prNumber}`, {
      token,
    });
    const observedHeadOid = readback?.head?.sha;
    if (observedHeadOid === committedHeadOid)
      return { readAttempts: readIndex + 1, readback };
    if (observedHeadOid !== previousHeadOid)
      throw new Error(
        `atomic commit readback observed unexpected PR head ${observedHeadOid ?? 'missing'}`
      );
    if (readIndex < delaysMs.length) await sleep(delaysMs[readIndex]);
  }
  throw new Error(
    `atomic commit readback did not expose committed head ${committedHeadOid}`
  );
}

async function fetchRepositoryFile(repository, path, ref, token) {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const payload = await githubRequest(
    `/repos/${repository}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`,
    { token }
  );
  if (
    payload?.type !== 'file' ||
    payload.encoding !== 'base64' ||
    !payload.content
  )
    throw new Error(`GitHub did not return base64 file content for ${path}`);
  return Buffer.from(payload.content.replace(/\s/g, ''), 'base64');
}

async function fetchChangedFiles(repository, prNumber, token) {
  const files = [];
  for (let page = 1; page <= 4; page += 1) {
    const batch = await githubRequest(
      `/repos/${repository}/pulls/${prNumber}/files?per_page=100&page=${page}`,
      { token }
    );
    files.push(...batch.map(file => file.filename));
    if (batch.length < 100) return files;
  }
  throw new Error('PR file manifest exceeds bounded pagination');
}

function appendOutput(name, value) {
  const output = process.env.GITHUB_OUTPUT;
  if (!output) throw new Error('GITHUB_OUTPUT is required');
  appendFileSync(output, `${name}=${value}\n`);
}

function writePlanOutputs(result) {
  appendOutput('candidate', String(result.eligible));
  if (!result.eligible) {
    appendOutput('reason', result.reason);
    return;
  }
  appendOutput('kind', result.plan.kind);
  appendOutput('pr_number', String(result.plan.prNumber));
  appendOutput('expected_head', result.plan.expectedHeadOid);
  appendOutput(
    'plan_b64',
    Buffer.from(JSON.stringify(result.plan)).toString('base64')
  );
}

/**
 * pnpm.overrides is a deliberate pin. When Dependabot edits the lockfile's
 * overrides block without the matching root package.json change, the lane
 * refuses loudly instead of rewriting either side (PR #18247).
 */
function failOnConfigMismatch(result, prNumber) {
  if (result.reason !== 'lockfile-config-mismatch') return;
  const message = `PR #${prNumber}: ERR_PNPM_LOCKFILE_CONFIG_MISMATCH. The lockfile "overrides" block no longer matches root package.json pnpm.overrides. Overrides are deliberate pins, so safe remediation will not regenerate this lockfile; close the Dependabot PR or change pnpm.overrides in a reviewed PR.`;
  console.error(`::error title=Dependabot overrides mismatch::${message}`);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n`);
  process.exitCode = 1;
}

async function fetchFailedJobLogs({ repository, workflowRun, token, accept }) {
  const jobsResponse = await githubRequest(
    `/repos/${repository}/actions/runs/${workflowRun.id}/jobs?filter=latest&per_page=100`,
    { token }
  );
  const failedJobs = [];
  for (const job of jobsResponse.jobs ?? []) {
    if (job.conclusion !== 'failure' || !accept(job)) continue;
    if (failedJobs.length >= MAX_ROOT_FAILED_JOB_LOGS) break;
    const log = await githubRequest(
      `/repos/${repository}/actions/jobs/${job.id}/logs`,
      { token }
    );
    failedJobs.push({
      id: job.id,
      name: job.name,
      conclusion: job.conclusion,
      log: typeof log === 'string' ? log : '',
    });
  }
  return failedJobs;
}

async function planRootCommand({ repository, workflowRun, pr, files, token }) {
  const manifestPaths = files.filter(isManifestPath).sort();
  const manifestEvidence = [];
  if (manifestPaths.length <= MAX_ROOT_MANIFESTS) {
    for (const path of manifestPaths) {
      const [baseBytes, headBytes] = await Promise.all([
        fetchRepositoryFile(repository, path, pr.base.sha, token),
        fetchRepositoryFile(repository, path, workflowRun.head_sha, token),
      ]);
      manifestEvidence.push(
        classifyDependencyManifestChange({ baseBytes, headBytes, path })
      );
    }
  }
  const failedJobs = await fetchFailedJobLogs({
    repository,
    workflowRun,
    token,
    accept: () => true,
  });
  const result = classifyRootLockDrift({
    workflowRun,
    pr,
    files,
    failedJobs,
    repository,
    manifestEvidence,
  });
  writePlanOutputs(result);
  failOnConfigMismatch(result, pr.number);
}

async function planCommand() {
  const token = process.env.GH_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!token || !repository || !eventPath)
    throw new Error('missing plan environment');
  const event = JSON.parse(readFileSync(eventPath, 'utf8'));
  const workflowRun = event.workflow_run;
  const prNumber = workflowRun?.pull_requests?.[0]?.number;
  if (!prNumber) {
    appendOutput('candidate', 'false');
    appendOutput('reason', 'workflow-has-no-unique-pr');
    return;
  }
  const pr = await githubRequest(`/repos/${repository}/pulls/${prNumber}`, {
    token,
  });
  // Cheap author gate first: the root lane observes every failed CI run.
  if (
    workflowRun.name === ROOT_WORKFLOW_NAME &&
    pr?.user?.login !== 'dependabot[bot]'
  ) {
    writePlanOutputs({ eligible: false, reason: 'author-not-dependabot' });
    return;
  }
  const files = await fetchChangedFiles(repository, prNumber, token);
  if (!/^[0-9a-f]{40}$/.test(pr.base?.sha ?? '')) {
    appendOutput('candidate', 'false');
    appendOutput('reason', 'invalid-base');
    return;
  }
  if (workflowRun.name === ROOT_WORKFLOW_NAME)
    return planRootCommand({ repository, workflowRun, pr, files, token });
  const basePackageBytes = await fetchRepositoryFile(
    repository,
    TARGET_PACKAGE_PATH,
    pr.base?.sha,
    token
  );
  const headPackageBytes = await fetchRepositoryFile(
    repository,
    TARGET_PACKAGE_PATH,
    workflowRun.head_sha,
    token
  );
  const manifestEvidence = classifyDependencyManifestChange({
    baseBytes: basePackageBytes,
    headBytes: headPackageBytes,
  });
  const failedJobs = await fetchFailedJobLogs({
    repository,
    workflowRun,
    token,
    accept: job => job.name === 'Verify isolated Eve pilot',
  });
  writePlanOutputs(
    classifyEveLockDrift({
      workflowRun,
      pr,
      files,
      failedJobs,
      repository,
      manifestEvidence,
    })
  );
}

function receiptCommand(args) {
  const plan = JSON.parse(readFileSync(args.get('--plan'), 'utf8'));
  const packageBytes =
    plan?.kind === ROOT_KIND ? undefined : readFileSync(args.get('--package'));
  const lockfileBytes = readFileSync(args.get('--lockfile'));
  const receipt = buildRemediationReceipt({
    plan,
    packageBytes,
    lockfileBytes,
  });
  writeFileSync(args.get('--output'), `${JSON.stringify(receipt)}\n`);
}

async function validateFreshEvidence({
  plan,
  receipt,
  args,
  lockfileBytes,
  token,
  repository,
  workflowRunId,
}) {
  const freshPr = await githubRequest(
    `/repos/${plan.repository}/pulls/${plan.prNumber}`,
    { token }
  );
  const freshFiles = await fetchChangedFiles(
    plan.repository,
    plan.prNumber,
    token
  );
  if (plan.kind === ROOT_KIND) {
    const freshManifests = [];
    for (const entry of plan.manifestEvidence ?? []) {
      const [baseBytes, headBytes] = await Promise.all([
        fetchRepositoryFile(plan.repository, entry.path, plan.baseOid, token),
        fetchRepositoryFile(
          plan.repository,
          entry.path,
          plan.expectedHeadOid,
          token
        ),
      ]);
      freshManifests.push({ path: entry.path, baseBytes, headBytes });
    }
    return validateRootRemediationArtifact({
      plan,
      freshPr,
      freshFiles,
      receipt,
      freshManifests,
      lockfileBytes,
      expectedRepository: repository,
      expectedWorkflowRunId: workflowRunId,
    });
  }
  const packageBytes = readFileSync(args.get('--package'));
  const freshPackageBytes = await fetchRepositoryFile(
    plan.repository,
    TARGET_PACKAGE_PATH,
    plan.expectedHeadOid,
    token
  );
  const freshBasePackageBytes = await fetchRepositoryFile(
    plan.repository,
    TARGET_PACKAGE_PATH,
    plan.baseOid,
    token
  );
  return validateRemediationArtifact({
    plan,
    freshPr,
    freshFiles,
    receipt,
    packageBytes,
    freshBasePackageBytes,
    freshPackageBytes,
    lockfileBytes,
    expectedRepository: repository,
    expectedWorkflowRunId: workflowRunId,
  });
}

async function commitCommand(args) {
  const token = process.env.GH_TOKEN;
  const statusToken = process.env.STATUS_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!token || !statusToken || !repository || !eventPath)
    throw new Error('missing atomic writer environment');
  const event = JSON.parse(readFileSync(eventPath, 'utf8'));
  const workflowRunId = event.workflow_run?.id;
  if (!Number.isInteger(workflowRunId))
    throw new Error('writer event has no workflow run id');
  const plan = JSON.parse(readFileSync(args.get('--plan'), 'utf8'));
  const receipt = JSON.parse(readFileSync(args.get('--receipt'), 'utf8'));
  const lockfileBytes = readFileSync(args.get('--lockfile'));
  const validation = await validateFreshEvidence({
    plan,
    receipt,
    args,
    lockfileBytes,
    token,
    repository,
    workflowRunId,
  });
  if (!validation.valid)
    throw new Error(`safe remediation refused: ${validation.reason}`);

  const graphql = await githubRequest('/graphql', {
    token,
    method: 'POST',
    body: {
      query: CREATE_COMMIT_MUTATION,
      variables: buildCreateCommitVariables({ plan, receipt, lockfileBytes }),
    },
  });
  if (graphql.errors?.length)
    throw new Error(
      `atomic commit failed: ${graphql.errors[0].type ?? 'unknown'}`
    );
  const commit = graphql.data?.createCommitOnBranch?.commit;
  if (!commit?.oid) throw new Error('atomic commit returned no oid');

  await waitForCommittedPrHead({
    repository: plan.repository,
    prNumber: plan.prNumber,
    previousHeadOid: plan.expectedHeadOid,
    committedHeadOid: commit.oid,
    token,
  });

  const targetUrl = `${process.env.GITHUB_SERVER_URL}/${plan.repository}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  await githubRequest(`/repos/${plan.repository}/statuses/${commit.oid}`, {
    token: statusToken,
    method: 'POST',
    body: {
      state: 'success',
      context: REMEDIATION_CONTEXT,
      description:
        plan.kind === ROOT_KIND
          ? 'Exact-head root lockfile repaired and verified by GitHub Actions'
          : 'Exact-head Eve lockfile repaired and tested by GitHub Actions',
      target_url: targetUrl,
    },
  });
  appendOutput('new_head', commit.oid);
}

function parseArgs(values) {
  const result = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith('--') || value === undefined)
      throw new Error('expected --name value arguments');
    result.set(key, value);
  }
  return result;
}

async function main() {
  const [command, ...rawArgs] = process.argv.slice(2);
  if (command === 'plan') return planCommand();
  const args = parseArgs(rawArgs);
  if (command === 'receipt') return receiptCommand(args);
  if (command === 'commit') return commitCommand(args);
  throw new Error(
    `unknown safe remediation command: ${command ?? '<missing>'}`
  );
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
