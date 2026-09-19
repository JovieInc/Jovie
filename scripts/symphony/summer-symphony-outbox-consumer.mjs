#!/usr/bin/env node
import { spawn } from 'node:child_process';
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as nodeSign,
  verify as nodeVerify,
  randomBytes,
} from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { isIP } from 'node:net';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export const READ_DOMAIN = 'summer.symphony-outbox-read/v1';
export const OUTBOX_DOMAIN = 'jovie.eve.symphony-repair-outbox/v1';
export const OUTBOX_DOMAIN_V2 = 'jovie.eve.symphony-repair-outbox/v2';
export const OUTBOX_DOMAIN_V3 = 'jovie.eve.symphony-repair-outbox/v3';
export const OUTCOME_DOMAIN_V3 = 'jovie.symphony-repair-outcome/v3';
export const OUTCOME_DOMAIN_V2 = 'jovie.symphony-repair-outcome/v2';
export const PAGE_SCHEMA = 'summer.symphony-outbox-page/v1';
export const STATE_SCHEMA = 'jovie.summer-symphony-consumer-state/v1';
export const DISCOVERY_CURSOR_SCHEMA =
  'jovie.summer-symphony-discovery-cursor/v1';
export const OUTBOX_PATH = '/summer/v1/symphony/outbox';
export const OUTCOME_PATH = '/summer/v1/symphony/outcomes';
export const TASK_RECORDS_PATH = '/summer/v1/symphony/task-records';
export const EXECUTION_HOLD =
  'v1-missing-explicit-execution-target-and-decision-fingerprint';
const TASK_ACCEPTANCE_SCHEMA = 'symphony-existing-repair-task-acceptance/v1';
export const SOURCE_EVALUATION_SCHEMA =
  'symphony-existing-repair-source-evaluation/v1';
const EXECUTION_EVIDENCE_KEYS =
  'runId provider model authPoolIdentity leaseIdentity evidenceDigest assignmentDigest providerGrantDigest acceptanceDigest runDigest taskAcceptanceDigest baseHead finalHead outputDigest sourceEvaluation verification'.split(
    ' '
  );
const SOURCE_EVALUATION_KEYS =
  'schema taskKey taskSelectionDigest sourceVersion snapshotDigest targetDigest identifier issueId repository pr baseHead finalHead targetObserved observedIssueId observedIssueRevision observedPrNumber observedPrHead observedRepository prMergeStateStatus mergeable workerAttested selectedEvidence taskResolved reason digest'.split(
    ' '
  );
const VERIFICATION_KEYS =
  'schema claimRecorded acceptanceRecorded runStarted runTerminal resultPersisted leaseHeld workspaceBound headObserved headChanged taskAccepted'.split(
    ' '
  );
const SOURCE_EVALUATION_REASONS = new Set([
  'target-observation-unavailable',
  'target-identity-mismatch',
  'head-unchanged',
  'task-check-unresolved',
  'task-check-evidence-unavailable',
  'task-check-passed',
]);
const CONTROLLER_TIMEOUT_MS = (5400 + 30) * 1000;
const CONTROLLER_OUTPUT_LIMIT = 128 * 1024;
export const OWNED_REPAIR_CONTROLLER_PACKAGE_SCHEMA =
  'symphony-existing-repair-controller-package/v1';
const OWNED_REPAIR_CONTROLLER_MANIFEST =
  'existing-repair-controller-manifest.json';
const OWNED_REPAIR_CONTROLLER_MANIFEST_KEYS = [
  'schema',
  'packageId',
  'command',
  'arguments',
  'launcherRelativePath',
  'releaseControllerRelativePath',
  'releaseValidatorRelativePath',
  'releaseResolverRelativePath',
  'installer',
];

const DIGEST = /^[a-f0-9]{64}$/u;
const SHA = /^[a-f0-9]{40}$/u;
const KEY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/u;
const SIGNATURE = /^ed25519=[A-Za-z0-9_-]{86}$/u;
const MAX_PAGES = 4;
const PAGE_LIMIT = 25;
export const MAX_OPEN_SUMMER_CHILDREN = 3;
export const OPEN_CHILD_BUDGET = 'linear-projection-open-child-budget-exceeded';
const RESPONSE_BYTE_LIMIT = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;

class OutboxPageLimitError extends Error {
  constructor(nextCursor) {
    super('outbox-page-limit-exceeded');
    this.nextCursor = nextCursor;
  }
}

const ACTIONS = new Set([
  'reconcile-release-certification-starvation',
  'reconcile-native-queue-starvation',
  'reconcile-closure-health-red',
  'reconcile-runner-capacity-starvation',
  'remediate-selected-ci-audit-class',
]);
const CI_IDS = new Set([
  'merge-group-flake-baseline-ratchet',
  'controller-cascade-coalescing',
  'auto-enroll-self-cancel-churn',
  'controller-check-run-pagination-cap',
  'obsolete-unaffected-native-lanes',
  'affected-only-unit-selection',
]);

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

function taskAcceptanceDigestV3(taskKey, existingRepair) {
  return digest({
    schema: TASK_ACCEPTANCE_SCHEMA,
    taskKey,
    assignmentDigest: existingRepair.assignmentDigest,
    existingRepair,
  });
}

export function symphonyTaskSelectionDigestV3(task) {
  return digest({
    taskKey: task.taskKey,
    action: task.action,
    selected: task.selected,
    source: task.source,
  });
}

export function symphonySourceEvaluationDigestV3(evaluation) {
  const { digest: _digest, ...unsigned } = evaluation;
  return digest({ schema: SOURCE_EVALUATION_SCHEMA, ...unsigned });
}

function exactKeys(value, keys) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join('\0') === [...keys].sort().join('\0')
  );
}

const SELECTED_CHECK_EVIDENCE_KEYS = [
  'id',
  'handle',
  'check',
  'result',
  'source',
];

function selectedCheckEvidenceShapeValid(value) {
  if (value === null) return true;
  return (
    exactKeys(value, SELECTED_CHECK_EVIDENCE_KEYS) &&
    typeof value.id === 'string' &&
    typeof value.handle === 'string' &&
    typeof value.check === 'string' &&
    value.id.length > 0 &&
    value.handle.length > 0 &&
    value.check.length > 0 &&
    value.result === 'SUCCESS' &&
    value.source === 'github-status-check-rollup'
  );
}

function selectedCheckEvidenceValid(value, boundTask) {
  if (!selectedCheckEvidenceShapeValid(value) || value === null) return false;
  const selected = boundTask?.selected;
  if (!selected) return true;
  return (
    value.id === selected.id &&
    value.handle === selected.handle &&
    (value.check === selected.id || value.check === selected.handle)
  );
}

function validTimestamp(value) {
  if (typeof value !== 'string' || value.length > 40) return false;
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/u.exec(
      value
    );
  if (!match) return false;
  const [, year, month, day, hour, minute, second, , offsetHour, offsetMinute] =
    match;
  const yearNumber = Number(year);
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  const daysInMonth = new Date(
    Date.UTC(yearNumber, monthNumber, 0)
  ).getUTCDate();
  return (
    monthNumber >= 1 &&
    monthNumber <= 12 &&
    dayNumber >= 1 &&
    dayNumber <= daysInMonth &&
    Number(hour) <= 23 &&
    Number(minute) <= 59 &&
    Number(second) <= 59 &&
    (offsetHour === undefined ||
      (Number(offsetHour) <= 23 && Number(offsetMinute) <= 59)) &&
    Number.isFinite(Date.parse(value))
  );
}

export function validateExistingRepair(target) {
  const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u;
  if (
    !exactKeys(target, [
      'mode',
      'identifier',
      'issueId',
      'ownerId',
      'issueRevision',
      'repository',
      'pr',
      'head',
      'workspace',
      'writerUnit',
      'assignmentDigest',
      'expiresAt',
    ]) ||
    target.mode !== 'isolated-cli' ||
    !/^JOV-[1-9][0-9]*$/u.test(target.identifier ?? '') ||
    !uuid.test(target.issueId ?? '') ||
    !uuid.test(target.ownerId ?? '') ||
    !validTimestamp(target.issueRevision) ||
    target.repository !== 'JovieInc/Jovie' ||
    !Number.isSafeInteger(target.pr) ||
    target.pr <= 0 ||
    !SHA.test(target.head ?? '') ||
    typeof target.workspace !== 'string' ||
    target.workspace.length > 1024 ||
    !/^\/(?!.*(?:^|\/)\.\.?(?:\/|$))[^\0\r\n]+$/u.test(target.workspace) ||
    !/^[a-zA-Z0-9_.@-]+\.service$/u.test(target.writerUnit ?? '') ||
    !DIGEST.test(target.assignmentDigest ?? '') ||
    !validTimestamp(target.expiresAt)
  ) {
    throw new Error('existing-repair-target-invalid');
  }
  return target;
}

export function validateTask(task) {
  const isV1 = task?.schema === 'jovie-symphony-repair-task/v1';
  const isV2 = task?.schema === 'jovie-symphony-repair-task/v2';
  const isV3 = task?.schema === 'jovie-symphony-repair-task/v3';
  if (
    (!isV1 && !isV2 && !isV3) ||
    !exactKeys(task, [
      'schema',
      'taskKey',
      ...(!isV1 ? ['decisionFingerprint'] : []),
      'createdAt',
      'owner',
      'route',
      'authority',
      'action',
      ...(isV1 ? ['issue'] : isV2 ? ['linearProjection'] : ['existingRepair']),
      'safety',
      'selected',
      'source',
    ]) ||
    !DIGEST.test(task.taskKey ?? '') ||
    !validTimestamp(task.createdAt) ||
    task.owner !== 'symphony' ||
    task.route !== 'symphony' ||
    (isV1 &&
      task.authority !==
        'source-repair-only-no-direct-pr-queue-or-deploy-mutation') ||
    (isV2 && task.authority !== 'linear-child-projection-only') ||
    (isV3
      ? task.authority !== 'host-assigned-isolated-repair-only' ||
        task.action !== 'execute-existing-owned-repair'
      : !ACTIONS.has(task.action)) ||
    (isV1 && task.issue !== 'JOV-5853') ||
    task.safety !==
      'exact-source-ci-native-queue-production-gates-remain-required' ||
    !exactKeys(task.selected, [
      'id',
      'sourceRevision',
      'sourceDigest',
      'owner',
      'handle',
    ]) ||
    !exactKeys(task.source, ['sourceVersion', 'snapshotDigest']) ||
    !SHA.test(task.selected.sourceRevision ?? '') ||
    !DIGEST.test(task.selected.sourceDigest ?? '') ||
    !/^[A-Za-z0-9][A-Za-z0-9:_-]{1,63}$/u.test(task.selected.owner ?? '') ||
    !/^[A-Za-z0-9][A-Za-z0-9:#/_-]{1,127}$/u.test(task.selected.handle ?? '') ||
    !SHA.test(task.source.sourceVersion ?? '') ||
    !DIGEST.test(task.source.snapshotDigest ?? '') ||
    task.selected.sourceRevision !== task.source.sourceVersion
  ) {
    throw new Error('outbox-task-invalid-or-cross-bound');
  }
  const release = task.selected.id === 'release-certification-starvation';
  const queueStarvation = task.selected.id === 'native-queue-starvation';
  const closureHealth = task.selected.id === 'closure-health-red';
  const runnerCapacity = task.selected.id === 'runner-capacity-starvation';
  if (
    !isV3 &&
    ((release &&
      task.action !== 'reconcile-release-certification-starvation') ||
      (queueStarvation &&
        task.action !== 'reconcile-native-queue-starvation') ||
      (closureHealth && task.action !== 'reconcile-closure-health-red') ||
      (runnerCapacity &&
        task.action !== 'reconcile-runner-capacity-starvation') ||
      (!release &&
        !queueStarvation &&
        !closureHealth &&
        !runnerCapacity &&
        (!CI_IDS.has(task.selected.id) ||
          task.action !== 'remediate-selected-ci-audit-class')))
  ) {
    throw new Error('outbox-task-action-cross-bound');
  }
  if (isV3) {
    validateExistingRepair(task.existingRepair);
    const lifetime =
      Date.parse(task.existingRepair.expiresAt) - Date.parse(task.createdAt);
    if (
      task.decisionFingerprint !== task.taskKey ||
      lifetime <= 0 ||
      lifetime > 5400000 ||
      (!release &&
        !queueStarvation &&
        !closureHealth &&
        !runnerCapacity &&
        !CI_IDS.has(task.selected.id))
    )
      throw new Error('existing-repair-task-cross-bound');
  }
  if (isV2) {
    const projection = task.linearProjection;
    const expectedTitle = `[summer-task:${task.taskKey}] ${task.selected.id}`;
    const expectedDescription = `[summer-task:${task.taskKey}]\n\nSelected: ${task.selected.id}\nAction: ${task.action}\nSource: ${task.source.sourceVersion}`;
    if (
      task.decisionFingerprint !== task.taskKey ||
      !exactKeys(projection, [
        'mutation',
        'team',
        'parentIssue',
        'title',
        'description',
        'initialState',
        'labels',
      ]) ||
      projection.mutation !== 'create-child-issue' ||
      projection.team !== 'JOV' ||
      projection.parentIssue !== 'JOV-5853' ||
      projection.title !== expectedTitle ||
      projection.title.length > 240 ||
      projection.description !== expectedDescription ||
      projection.description.length > 1000 ||
      projection.initialState !== 'Todo' ||
      !Array.isArray(projection.labels) ||
      projection.labels.length !== 1 ||
      projection.labels[0] !== 'symphony'
    ) {
      throw new Error('outbox-task-v2-projection-cross-bound');
    }
  }
  return task;
}

export function parseVerificationKeys(value) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('outbox-verification-keys-invalid');
  }
  if (
    parsed === null ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    Object.keys(parsed).length === 0
  ) {
    throw new Error('outbox-verification-keys-invalid');
  }
  const keys = new Map();
  for (const [id, key] of Object.entries(parsed)) {
    if (!KEY_ID.test(id) || typeof key !== 'string' || key.trim() === '')
      throw new Error('outbox-verification-keys-invalid');
    try {
      createPrivateKey(key);
      throw new Error('outbox-verification-keys-invalid');
    } catch (error) {
      if (error?.message === 'outbox-verification-keys-invalid') throw error;
    }
    const publicKey = createPublicKey(key);
    if (
      publicKey.type !== 'public' ||
      publicKey.asymmetricKeyType !== 'ed25519'
    ) {
      throw new Error('outbox-verification-keys-invalid');
    }
    keys.set(id, publicKey);
  }
  return keys;
}

function publicKeyFingerprint(key) {
  const publicKey = key?.type === 'public' ? key : createPublicKey(key);
  return createHash('sha256')
    .update(publicKey.export({ type: 'spki', format: 'der' }))
    .digest('hex');
}

export function verifyOutboxRecord(record, keys) {
  const domain =
    record?.schema === OUTBOX_DOMAIN
      ? OUTBOX_DOMAIN
      : record?.schema === OUTBOX_DOMAIN_V2
        ? OUTBOX_DOMAIN_V2
        : record?.schema === OUTBOX_DOMAIN_V3
          ? OUTBOX_DOMAIN_V3
          : null;
  if (
    !exactKeys(record, [
      'schema',
      'destination',
      'idempotencyKey',
      'status',
      'task',
      'signatureKeyId',
      'signature',
    ]) ||
    !domain ||
    record.destination !== 'symphony' ||
    record.status !== 'ready' ||
    !KEY_ID.test(record.signatureKeyId ?? '') ||
    !SIGNATURE.test(record.signature ?? '')
  ) {
    throw new Error('outbox-record-invalid');
  }
  const task = validateTask(record.task);
  if (
    (domain === OUTBOX_DOMAIN &&
      task.schema !== 'jovie-symphony-repair-task/v1') ||
    (domain === OUTBOX_DOMAIN_V2 &&
      task.schema !== 'jovie-symphony-repair-task/v2') ||
    (domain === OUTBOX_DOMAIN_V3 &&
      task.schema !== 'jovie-symphony-repair-task/v3')
  ) {
    throw new Error('outbox-wire-version-cross-bound');
  }
  if (record.idempotencyKey !== task.taskKey)
    throw new Error('outbox-task-key-cross-bound');
  const publicKey = keys.get(record.signatureKeyId);
  if (!publicKey) throw new Error('outbox-signing-key-unknown');
  const { signature, ...unsigned } = record;
  if (
    !nodeVerify(
      null,
      Buffer.from(`${domain}\0${canonical(unsigned)}`),
      publicKey,
      Buffer.from(signature.slice('ed25519='.length), 'base64url')
    )
  ) {
    throw new Error('outbox-signature-invalid');
  }
  return task;
}

export function signOutcomeV3(task, result, privateKey, keyId) {
  const unsigned = {
    schema: OUTCOME_DOMAIN_V3,
    taskKey: task.taskKey,
    decisionFingerprint: task.decisionFingerprint,
    status: result?.status,
    detail: result?.detail,
    completedAt: result?.completedAt,
    source: { ...task.source, action: task.action },
    existingRepair: task.existingRepair,
    execution: result?.execution,
    signatureKeyId: keyId,
  };
  return {
    ...unsigned,
    signature: `ed25519=${nodeSign(null, Buffer.from(`${OUTCOME_DOMAIN_V3}\0${canonical(unsigned)}`), privateKey).toString('base64url')}`,
  };
}

export function validateExecutionEvidenceV3(outcome, boundTask) {
  const execution = outcome?.execution;
  const verification = execution?.verification;
  const sourceEvaluation = execution?.sourceEvaluation;
  const target = outcome?.existingRepair;
  const sourceTaskResolved =
    sourceEvaluation?.targetObserved &&
    sourceEvaluation.finalHead !== sourceEvaluation.baseHead &&
    sourceEvaluation.prMergeStateStatus === 'CLEAN' &&
    sourceEvaluation.mergeable === 'MERGEABLE' &&
    selectedCheckEvidenceValid(sourceEvaluation?.selectedEvidence, boundTask);
  const sourceObservationMatches =
    !sourceEvaluation?.targetObserved ||
    (sourceEvaluation.observedIssueId === target?.issueId &&
      sourceEvaluation.observedIssueRevision === target?.issueRevision &&
      sourceEvaluation.observedPrNumber === target?.pr &&
      sourceEvaluation.observedPrHead === execution?.finalHead &&
      sourceEvaluation.observedRepository === target?.repository);
  if (
    !exactKeys(execution, EXECUTION_EVIDENCE_KEYS) ||
    !exactKeys(sourceEvaluation, SOURCE_EVALUATION_KEYS) ||
    !exactKeys(verification, VERIFICATION_KEYS) ||
    verification.schema !== 'symphony-existing-repair-evidence/v1' ||
    ![
      'claimRecorded',
      'acceptanceRecorded',
      'runStarted',
      'runTerminal',
      'resultPersisted',
      'leaseHeld',
      'workspaceBound',
      'headObserved',
    ].every(key => verification[key] === true) ||
    typeof verification.headChanged !== 'boolean' ||
    typeof verification.taskAccepted !== 'boolean' ||
    !DIGEST.test(execution.assignmentDigest) ||
    !DIGEST.test(execution.providerGrantDigest) ||
    !DIGEST.test(execution.acceptanceDigest) ||
    !DIGEST.test(execution.runDigest) ||
    !DIGEST.test(execution.taskAcceptanceDigest) ||
    !DIGEST.test(execution.outputDigest) ||
    !SHA.test(execution.baseHead) ||
    !SHA.test(execution.finalHead) ||
    execution.baseHead !== target?.head ||
    execution.taskAcceptanceDigest !==
      taskAcceptanceDigestV3(outcome?.taskKey, outcome?.existingRepair) ||
    verification.headChanged !== (execution.baseHead !== execution.finalHead) ||
    sourceEvaluation.schema !== SOURCE_EVALUATION_SCHEMA ||
    sourceEvaluation.taskKey !== outcome?.taskKey ||
    !DIGEST.test(sourceEvaluation.taskSelectionDigest ?? '') ||
    (boundTask &&
      sourceEvaluation.taskSelectionDigest !==
        symphonyTaskSelectionDigestV3(boundTask)) ||
    sourceEvaluation.sourceVersion !== outcome?.source?.sourceVersion ||
    sourceEvaluation.snapshotDigest !== outcome?.source?.snapshotDigest ||
    sourceEvaluation.targetDigest !== digest(target) ||
    sourceEvaluation.identifier !== target?.identifier ||
    sourceEvaluation.issueId !== target?.issueId ||
    sourceEvaluation.repository !== target?.repository ||
    sourceEvaluation.pr !== target?.pr ||
    sourceEvaluation.baseHead !== execution.baseHead ||
    sourceEvaluation.finalHead !== execution.finalHead ||
    typeof sourceEvaluation.targetObserved !== 'boolean' ||
    typeof sourceEvaluation.workerAttested !== 'boolean' ||
    !selectedCheckEvidenceShapeValid(sourceEvaluation.selectedEvidence) ||
    typeof sourceEvaluation.taskResolved !== 'boolean' ||
    !SOURCE_EVALUATION_REASONS.has(sourceEvaluation.reason) ||
    sourceEvaluation.digest !==
      symphonySourceEvaluationDigestV3(sourceEvaluation) ||
    !sourceObservationMatches ||
    (sourceEvaluation.taskResolved &&
      sourceEvaluation.reason !== 'task-check-passed') ||
    sourceEvaluation.taskResolved !== sourceTaskResolved ||
    verification.taskAccepted !==
      (sourceEvaluation.workerAttested && sourceEvaluation.taskResolved)
  ) {
    throw new Error('consumer-execution-evidence-invalid-or-cross-bound');
  }
  const { evidenceDigest: _evidenceDigest, ...unsigned } = execution;
  const expected = digest({
    schema: 'symphony-existing-repair-evidence/v1',
    ...unsigned,
  });
  if (expected !== execution.evidenceDigest) {
    throw new Error('consumer-execution-evidence-digest-invalid');
  }
  if (outcome?.status === 'succeeded' && !verification.headChanged) {
    throw new Error('consumer-execution-success-without-head-change');
  }
  return outcome;
}

export function validateOutcomeV3(outcome, task, publicKey) {
  const execution = outcome?.execution;
  if (
    !exactKeys(outcome, [
      'schema',
      'taskKey',
      'decisionFingerprint',
      'status',
      'detail',
      'completedAt',
      'source',
      'existingRepair',
      'execution',
      'signatureKeyId',
      'signature',
    ]) ||
    outcome.schema !== OUTCOME_DOMAIN_V3 ||
    outcome.taskKey !== task.taskKey ||
    outcome.decisionFingerprint !== task.decisionFingerprint ||
    !['succeeded', 'failed'].includes(outcome.status) ||
    typeof outcome.detail !== 'string' ||
    !outcome.detail.length ||
    outcome.detail.length > 240 ||
    !validTimestamp(outcome.completedAt) ||
    Date.parse(outcome.completedAt) < Date.parse(task.createdAt) ||
    canonical(outcome.source) !==
      canonical({ ...task.source, action: task.action }) ||
    canonical(outcome.existingRepair) !== canonical(task.existingRepair) ||
    !exactKeys(execution, [
      'runId',
      'provider',
      'model',
      'authPoolIdentity',
      'leaseIdentity',
      'evidenceDigest',
      'assignmentDigest',
      'providerGrantDigest',
      'acceptanceDigest',
      'runDigest',
      'taskAcceptanceDigest',
      'baseHead',
      'finalHead',
      'outputDigest',
      'sourceEvaluation',
      'verification',
    ]) ||
    !['runId', 'provider', 'model'].every(
      key =>
        typeof execution[key] === 'string' &&
        execution[key].length > 0 &&
        execution[key].length <= (key === 'provider' ? 64 : 128)
    ) ||
    execution.provider === 'codex' ||
    !['authPoolIdentity', 'leaseIdentity', 'evidenceDigest'].every(key =>
      DIGEST.test(execution[key])
    ) ||
    !KEY_ID.test(outcome.signatureKeyId ?? '') ||
    !SIGNATURE.test(outcome.signature ?? '')
  ) {
    throw new Error('consumer-execution-outcome-invalid-or-cross-bound');
  }
  validateExecutionEvidenceV3(outcome, task);
  const { signature, ...unsigned } = outcome;
  if (
    !publicKey ||
    !nodeVerify(
      null,
      Buffer.from(`${OUTCOME_DOMAIN_V3}\0${canonical(unsigned)}`),
      publicKey,
      Buffer.from(signature.slice(8), 'base64url')
    )
  ) {
    throw new Error('consumer-execution-outcome-signature-invalid');
  }
  return outcome;
}

function resolveOwnedRepairController(environment = process.env) {
  const workspace = environment.GEM_WORKSPACE?.trim();
  if (!workspace || !isAbsolute(workspace))
    throw new Error('existing-repair-controller-package-unavailable');
  const manifestPath = join(
    workspace,
    'config',
    OWNED_REPAIR_CONTROLLER_MANIFEST
  );
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    throw new Error('existing-repair-controller-package-unavailable');
  }
  if (
    !exactKeys(manifest, OWNED_REPAIR_CONTROLLER_MANIFEST_KEYS) ||
    manifest.schema !== OWNED_REPAIR_CONTROLLER_PACKAGE_SCHEMA ||
    manifest.packageId !== 'symphony-codex-auth-fallback' ||
    manifest.command !== 'symphony-codex-exhausted.py' ||
    !Array.isArray(manifest.arguments) ||
    manifest.arguments.length !== 1 ||
    manifest.arguments[0] !== 'owned-repair' ||
    manifest.installer !==
      'scripts/symphony/symphony-codex-exhausted.py install'
  ) {
    throw new Error('existing-repair-controller-package-invalid');
  }
  const relativePaths = [
    manifest.launcherRelativePath,
    manifest.releaseControllerRelativePath,
    manifest.releaseValidatorRelativePath,
  ];
  if (
    relativePaths.some(
      path =>
        typeof path !== 'string' ||
        path.length === 0 ||
        path.startsWith('/') ||
        path.includes('\\') ||
        path.split('/').includes('..')
    )
  ) {
    throw new Error('existing-repair-controller-package-path-invalid');
  }
  const home = (environment.HOME?.trim() || homedir()).replace(/\/$/u, '');
  if (!isAbsolute(home))
    throw new Error('existing-repair-controller-package-home-invalid');
  const launcher = join(home, manifest.launcherRelativePath);
  const releaseController = join(home, manifest.releaseControllerRelativePath);
  const releaseValidator = join(home, manifest.releaseValidatorRelativePath);
  for (const path of [launcher, releaseController, releaseValidator]) {
    try {
      if (!lstatSync(path).isFile())
        throw new Error('existing-repair-controller-package-unavailable');
    } catch (error) {
      if (error?.message === 'existing-repair-controller-package-unavailable')
        throw error;
      throw new Error('existing-repair-controller-package-unavailable');
    }
  }
  return { command: launcher, args: manifest.arguments };
}

/**
 * Minimal controller child-process surface the executor actually consumes.
 * Structural (not ChildProcess) so test fakes remain assignable.
 *
 * @typedef {object} OwnedRepairControllerProcess
 * @property {{ on(event: string, listener: (chunk: any) => void): void }=} stdout
 * @property {{ on(event: string, listener: (chunk: any) => void): void }=} stderr
 * @property {{ end(input: string): void }=} stdin
 * @property {((...args: any[]) => unknown)=} kill
 * @property {(event: string, listener: (...args: any[]) => void) => void} once
 */

/**
 * Injection points for the owned-repair executor. Both keys are optional;
 * tests inject exactly one. Omit both to run the real controller launcher
 * through node:child_process spawn.
 *
 * - `run` — synchronous spawnSync-shaped injection
 *   `(binary, args, options) => { status, stdout, error? }`; the executor
 *   passes the task JSON as `options.input`.
 * - `spawnProcess` — async spawn-shaped injection
 *   `(binary, args, options) => controllerProcess`; the executor pipes
 *   `JSON.stringify(task)` to `stdin.end` and parses the collected stdout.
 *
 * @typedef {object} OwnedRepairExecutorOptions
 * @property {((binary: string, args: string[], options: {
 *   input: string, encoding: string, timeout: number, maxBuffer: number
 * }) => { status: number | null, stdout: string, error?: Error })=} run
 *   Synchronous controller invocation override.
 * @property {((binary: string, args: readonly string[] | undefined, options: import('node:child_process').SpawnOptions | undefined) => OwnedRepairControllerProcess)=} spawnProcess
 *   Asynchronous controller spawn override.
 */

/**
 * @param {unknown} task
 * @param {((binary: string, args: readonly string[] | undefined, options: import('node:child_process').SpawnOptions | undefined) => OwnedRepairControllerProcess)=} spawnProcess
 * @returns {Promise<unknown>}
 */
function runOwnedRepairController(task, spawnProcess = spawn) {
  return new Promise((resolve, reject) => {
    let command;
    try {
      command = resolveOwnedRepairController();
    } catch (_error) {
      resolve({
        status: 'held',
        reason: 'qualified-isolated-repair-executor-unavailable',
      });
      return;
    }
    const child = spawnProcess(command.command, command.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };
    const append = (target, chunk) => {
      const text = Buffer.isBuffer(chunk)
        ? chunk.toString('utf8')
        : String(chunk);
      if (target === 'stdout') stdout += text;
      else stderr += text;
      if (
        Buffer.byteLength(target === 'stdout' ? stdout : stderr) >
        CONTROLLER_OUTPUT_LIMIT
      ) {
        child.kill('SIGTERM');
        finish(new Error('existing-repair-controller-output-too-large'));
      }
    };
    child.stdout?.on('data', chunk => append('stdout', chunk));
    child.stderr?.on('data', chunk => append('stderr', chunk));
    child.once('error', error => finish(error));
    child.once('close', (status, signal) => {
      if (settled) return;
      if (status !== 0 || signal) {
        finish(new Error('existing-repair-controller-unavailable'));
        return;
      }
      try {
        finish(null, JSON.parse(stdout));
      } catch {
        finish(new Error('existing-repair-controller-invalid-json'));
      }
    });
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish(new Error('existing-repair-controller-timeout'));
    }, CONTROLLER_TIMEOUT_MS);
    try {
      child.stdin?.end(JSON.stringify(task));
    } catch (error) {
      finish(error);
    }
  });
}

/** Existing host controller owns qualification and the shared lease. */

/**
 * @param {OwnedRepairExecutorOptions=} executorOptions
 */
export function createOwnedRepairExecutor({ run, spawnProcess = spawn } = {}) {
  return {
    async execute(task) {
      validateTask(task);
      if (task.schema !== 'jovie-symphony-repair-task/v3')
        throw new Error('existing-repair-v3-required');
      if (run) {
        const command = resolveOwnedRepairController();
        const result = run(command.command, command.args, {
          input: JSON.stringify(task),
          encoding: 'utf8',
          timeout: CONTROLLER_TIMEOUT_MS,
          maxBuffer: CONTROLLER_OUTPUT_LIMIT,
        });
        if (result.error || result.status !== 0)
          throw new Error('existing-repair-controller-unavailable');
        return JSON.parse(result.stdout);
      }
      return runOwnedRepairController(task, spawnProcess);
    },
  };
}

function unsignedOutcomeV2(task, issue, keyId) {
  return {
    schema: OUTCOME_DOMAIN_V2,
    taskKey: task.taskKey,
    status: 'succeeded',
    detail: `Created Linear child ${issue.identifier}`,
    completedAt: issue.createdAt,
    source: {
      action: task.action,
      snapshotDigest: task.source.snapshotDigest,
      sourceVersion: task.source.sourceVersion,
    },
    decisionFingerprint: task.decisionFingerprint,
    linearProjection: task.linearProjection,
    result: { issueIdentifier: issue.identifier },
    signatureKeyId: keyId,
  };
}

export function signOutcomeV2(task, issue, privateKey, keyId) {
  const unsigned = unsignedOutcomeV2(task, issue, keyId);
  return {
    ...unsigned,
    signature: `ed25519=${nodeSign(
      null,
      Buffer.from(`${OUTCOME_DOMAIN_V2}\0${canonical(unsigned)}`),
      privateKey
    ).toString('base64url')}`,
  };
}

function validateOutcomeV2(outcome, task, publicKey) {
  if (
    !exactKeys(outcome, [
      'schema',
      'taskKey',
      'status',
      'detail',
      'completedAt',
      'source',
      'decisionFingerprint',
      'linearProjection',
      'result',
      'signatureKeyId',
      'signature',
    ]) ||
    outcome.schema !== OUTCOME_DOMAIN_V2 ||
    outcome.taskKey !== task.taskKey ||
    outcome.status !== 'succeeded' ||
    typeof outcome.detail !== 'string' ||
    outcome.detail.length < 1 ||
    outcome.detail.length > 240 ||
    !validTimestamp(outcome.completedAt) ||
    !exactKeys(outcome.source, ['action', 'snapshotDigest', 'sourceVersion']) ||
    outcome.source.action !== task.action ||
    outcome.source.snapshotDigest !== task.source.snapshotDigest ||
    outcome.source.sourceVersion !== task.source.sourceVersion ||
    outcome.decisionFingerprint !== task.decisionFingerprint ||
    canonical(outcome.linearProjection) !== canonical(task.linearProjection) ||
    !exactKeys(outcome.result, ['issueIdentifier']) ||
    !/^JOV-[1-9][0-9]*$/u.test(outcome.result.issueIdentifier ?? '') ||
    outcome.result.issueIdentifier === task.linearProjection.parentIssue ||
    !KEY_ID.test(outcome.signatureKeyId ?? '') ||
    !SIGNATURE.test(outcome.signature ?? '')
  ) {
    throw new Error('consumer-outcome-invalid-or-cross-bound');
  }
  if (publicKey) {
    const { signature, ...unsigned } = outcome;
    if (
      !nodeVerify(
        null,
        Buffer.from(`${OUTCOME_DOMAIN_V2}\0${canonical(unsigned)}`),
        publicKey,
        Buffer.from(signature.slice('ed25519='.length), 'base64url')
      )
    ) {
      throw new Error('consumer-outcome-signature-invalid');
    }
  }
  return outcome;
}

export function signedReadHeaders(target, nowMs, privateKey, keyId, nonce) {
  const timestamp = String(Math.floor(nowMs / 1000));
  if (
    !/^\d{10}$/u.test(timestamp) ||
    !KEY_ID.test(keyId) ||
    !/^[A-Za-z0-9_-]{16,128}$/u.test(nonce)
  ) {
    throw new Error('read-proof-input-invalid');
  }
  const unsigned = {
    method: 'GET',
    target,
    timestamp,
    nonce,
    signatureKeyId: keyId,
  };
  const signature = nodeSign(
    null,
    Buffer.from(`${READ_DOMAIN}\0${canonical(unsigned)}`),
    privateKey
  ).toString('base64url');
  return {
    'x-summer-timestamp': timestamp,
    'x-summer-nonce': nonce,
    'x-summer-key-id': keyId,
    'x-summer-signature': `ed25519=${signature}`,
  };
}

function assertPage(page, previousCursor) {
  if (
    !exactKeys(page, ['schema', 'records', 'cursor', 'hasMore', 'scanned']) ||
    page.schema !== PAGE_SCHEMA ||
    !Array.isArray(page.records) ||
    page.records.length > PAGE_LIMIT ||
    typeof page.hasMore !== 'boolean' ||
    !Number.isInteger(page.scanned) ||
    page.scanned < 0 ||
    page.scanned > PAGE_LIMIT ||
    !(
      page.cursor === null ||
      (typeof page.cursor === 'string' && page.cursor.length <= 2048)
    ) ||
    (page.hasMore && (!page.cursor || page.cursor === previousCursor)) ||
    (!page.hasMore && page.cursor !== null)
  ) {
    throw new Error('outbox-page-invalid');
  }
}

export async function discoverOne(transport, keys, startCursor = null) {
  if (
    !(
      startCursor === null ||
      (typeof startCursor === 'string' &&
        startCursor.length > 0 &&
        startCursor.length <= 2048)
    )
  ) {
    throw new Error('outbox-cursor-invalid');
  }
  let cursor = startCursor;
  for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
    const page = await transport.readPage(cursor, PAGE_LIMIT);
    assertPage(page, cursor);
    let found = null;
    for (const record of page.records) {
      const task = verifyOutboxRecord(record, keys);
      if (
        found?.taskKey === task.taskKey &&
        canonical(found.record) !== canonical(record)
      ) {
        throw new Error('outbox-task-conflict');
      }
      found ??= { taskKey: task.taskKey, record };
    }
    if (found) return found;
    if (!page.hasMore) return null;
    cursor = page.cursor;
  }
  throw new OutboxPageLimitError(cursor);
}

function emptyState() {
  return { schema: STATE_SCHEMA, active: null };
}

export function validateState(state, keys, outcomePublicKey = null) {
  if (
    !exactKeys(state, ['schema', 'active']) ||
    state.schema !== STATE_SCHEMA
  ) {
    throw new Error('consumer-state-invalid');
  }
  if (state.active === null) return state;
  const task = verifyOutboxRecord(state.active.record, keys);
  if (state.active.taskKey !== task.taskKey) {
    throw new Error('consumer-state-invalid');
  }
  if (task.schema === 'jovie-symphony-repair-task/v1') {
    if (
      !exactKeys(state.active, ['phase', 'hold', 'taskKey', 'record']) ||
      state.active.phase !== 'discovered' ||
      state.active.hold !== EXECUTION_HOLD
    ) {
      throw new Error('consumer-state-invalid');
    }
  } else if (state.active.phase === 'discovered') {
    if (!exactKeys(state.active, ['phase', 'taskKey', 'record'])) {
      throw new Error('consumer-state-invalid');
    }
  } else if (state.active.phase === 'outcome-pending') {
    if (!exactKeys(state.active, ['phase', 'taskKey', 'record', 'outcome'])) {
      throw new Error('consumer-state-invalid');
    }
    (task.schema.endsWith('/v3') ? validateOutcomeV3 : validateOutcomeV2)(
      state.active.outcome,
      task,
      outcomePublicKey
    );
  } else {
    throw new Error('consumer-state-invalid');
  }
  return state;
}

export function createFileJournal(workspace, keys, outcomePublicKey = null) {
  if (!isAbsolute(workspace)) throw new Error('GEM_WORKSPACE-must-be-absolute');
  const sharedStateDirectory = join(workspace, 'state');
  const privateStateDirectory = join(
    sharedStateDirectory,
    'summer-symphony-consumer'
  );
  const path = join(privateStateDirectory, 'state.json');
  const discoveryCursorPath = join(
    privateStateDirectory,
    'discovery-cursor.json'
  );

  const assertOwnedDirectory = (candidate, exactMode = null) => {
    const metadata = lstatSync(candidate);
    if (
      !metadata.isDirectory() ||
      metadata.isSymbolicLink() ||
      (exactMode === null
        ? (metadata.mode & 0o022) !== 0
        : (metadata.mode & 0o777) !== exactMode) ||
      (typeof process.getuid === 'function' &&
        metadata.uid !== process.getuid())
    ) {
      throw new Error('consumer-state-directory-unsafe');
    }
  };

  const ensureDirectory = () => {
    const workspaceMetadata = lstatSync(workspace);
    if (
      !workspaceMetadata.isDirectory() ||
      workspaceMetadata.isSymbolicLink() ||
      (typeof process.getuid === 'function' &&
        workspaceMetadata.uid !== process.getuid())
    ) {
      throw new Error('GEM_WORKSPACE-unsafe');
    }
    /** @type {Array<[string, number | null]>} */
    const directories = [
      [sharedStateDirectory, null],
      [privateStateDirectory, 0o700],
    ];
    for (const [candidate, mode] of directories) {
      try {
        mkdirSync(candidate, { mode: 0o700 });
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
      }
      assertOwnedDirectory(candidate, mode);
    }
    const workspaceReal = realpathSync(workspace);
    const directoryReal = realpathSync(privateStateDirectory);
    if (!directoryReal.startsWith(`${workspaceReal}${sep}`)) {
      throw new Error('consumer-state-directory-unsafe');
    }
  };

  const assertOwnedFile = fd => {
    const metadata = fstatSync(fd);
    if (
      !metadata.isFile() ||
      (metadata.mode & 0o777) !== 0o600 ||
      (typeof process.getuid === 'function' &&
        metadata.uid !== process.getuid())
    ) {
      throw new Error('consumer-state-file-unsafe');
    }
  };

  const readOwnedJson = candidate => {
    let fd;
    try {
      fd = openSync(candidate, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
      assertOwnedFile(fd);
      return JSON.parse(readFileSync(fd, 'utf8'));
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
  };

  const replaceOwnedJson = (candidate, value) => {
    ensureDirectory();
    try {
      const currentFd = openSync(
        candidate,
        fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW
      );
      try {
        assertOwnedFile(currentFd);
      } finally {
        closeSync(currentFd);
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    const temporary = `${candidate}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
    try {
      const fd = openSync(
        temporary,
        fsConstants.O_WRONLY |
          fsConstants.O_CREAT |
          fsConstants.O_EXCL |
          fsConstants.O_NOFOLLOW,
        0o600
      );
      try {
        writeFileSync(fd, `${JSON.stringify(value)}\n`, 'utf8');
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      renameSync(temporary, candidate);
      const directoryFd = openSync(dirname(candidate), 'r');
      try {
        fsyncSync(directoryFd);
      } finally {
        closeSync(directoryFd);
      }
    } finally {
      rmSync(temporary, { force: true });
    }
  };

  return {
    path,
    discoveryCursorPath,
    read() {
      ensureDirectory();
      try {
        return validateState(readOwnedJson(path), keys, outcomePublicKey);
      } catch (error) {
        if (error?.code === 'ENOENT') return emptyState();
        throw error;
      }
    },
    write(state) {
      validateState(state, keys, outcomePublicKey);
      replaceOwnedJson(path, state);
    },
    publish(state) {
      validateState(state, keys, outcomePublicKey);
      ensureDirectory();
      const temporary = `${path}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
      try {
        const fd = openSync(
          temporary,
          fsConstants.O_WRONLY |
            fsConstants.O_CREAT |
            fsConstants.O_EXCL |
            fsConstants.O_NOFOLLOW,
          0o600
        );
        try {
          writeFileSync(fd, `${JSON.stringify(state)}\n`, 'utf8');
          fsyncSync(fd);
        } finally {
          closeSync(fd);
        }
        try {
          linkSync(temporary, path);
        } catch (error) {
          if (error?.code !== 'EEXIST') throw error;
        }
        const directoryFd = openSync(dirname(path), 'r');
        try {
          fsyncSync(directoryFd);
        } finally {
          closeSync(directoryFd);
        }
        return this.read();
      } finally {
        rmSync(temporary, { force: true });
      }
    },
    clear(expectedTaskKey) {
      const current = this.read();
      if (current.active?.taskKey !== expectedTaskKey) {
        throw new Error('consumer-state-clear-cross-bound');
      }
      unlinkSync(path);
      const directoryFd = openSync(dirname(path), 'r');
      try {
        fsyncSync(directoryFd);
      } finally {
        closeSync(directoryFd);
      }
    },
    readDiscoveryCursor() {
      ensureDirectory();
      try {
        const persisted = readOwnedJson(discoveryCursorPath);
        if (
          !exactKeys(persisted, ['schema', 'cursor']) ||
          persisted.schema !== DISCOVERY_CURSOR_SCHEMA ||
          typeof persisted.cursor !== 'string' ||
          persisted.cursor.length === 0 ||
          persisted.cursor.length > 2048
        ) {
          throw new Error('consumer-discovery-cursor-invalid');
        }
        return persisted.cursor;
      } catch (error) {
        if (error?.code === 'ENOENT') return null;
        throw error;
      }
    },
    writeDiscoveryCursor(cursor) {
      if (
        typeof cursor !== 'string' ||
        cursor.length === 0 ||
        cursor.length > 2048
      ) {
        throw new Error('consumer-discovery-cursor-invalid');
      }
      replaceOwnedJson(discoveryCursorPath, {
        schema: DISCOVERY_CURSOR_SCHEMA,
        cursor,
      });
    },
    clearDiscoveryCursor() {
      ensureDirectory();
      try {
        unlinkSync(discoveryCursorPath);
      } catch (error) {
        if (error?.code === 'ENOENT') return;
        throw error;
      }
      const directoryFd = openSync(dirname(discoveryCursorPath), 'r');
      try {
        fsyncSync(directoryFd);
      } finally {
        closeSync(directoryFd);
      }
    },
  };
}

export async function runCycle({
  journal,
  transport,
  keys,
  projector = null,
  executor = null,
  outcomePrivateKey = null,
  outcomePublicKey = null,
  outcomeKeyId = null,
}) {
  let state = journal.read();
  if (state.active?.record?.task?.schema === 'jovie-symphony-repair-task/v1') {
    return {
      status: 'execution-held',
      taskKey: state.active.taskKey,
      reason: state.active.hold,
    };
  }
  if (!state.active) {
    const discoveryCursor = journal.readDiscoveryCursor?.() ?? null;
    let discovered;
    try {
      discovered = await discoverOne(transport, keys, discoveryCursor);
    } catch (error) {
      if (
        !(error instanceof OutboxPageLimitError) ||
        typeof journal.writeDiscoveryCursor !== 'function'
      ) {
        throw error;
      }
      journal.writeDiscoveryCursor(error.nextCursor);
      return { status: 'scan-deferred' };
    }
    journal.clearDiscoveryCursor?.();
    if (!discovered) return { status: 'idle' };
    const isV1 =
      discovered.record.task.schema === 'jovie-symphony-repair-task/v1';
    const candidate = {
      ...state,
      active: {
        phase: 'discovered',
        ...(isV1 ? { hold: EXECUTION_HOLD } : {}),
        taskKey: discovered.taskKey,
        record: discovered.record,
      },
    };
    if (journal.publish) {
      state = journal.publish(candidate);
    } else {
      journal.write(candidate);
      state = candidate;
    }
  }
  const task = verifyOutboxRecord(state.active.record, keys);
  if (task.schema === 'jovie-symphony-repair-task/v1') {
    return {
      status: 'execution-held',
      taskKey: state.active.taskKey,
      reason: EXECUTION_HOLD,
    };
  }
  if (task.schema === 'jovie-symphony-repair-task/v3') {
    if (
      !outcomePrivateKey ||
      !outcomePublicKey ||
      !KEY_ID.test(outcomeKeyId ?? '')
    )
      throw new Error('v3-signing-configuration-missing');
    if (state.active.phase === 'discovered') {
      if (!executor)
        return {
          status: 'execution-held',
          taskKey: task.taskKey,
          reason: 'qualified-isolated-repair-executor-unavailable',
        };
      const result = await executor.execute(task);
      if (result?.status === 'held' && typeof result.reason === 'string')
        return {
          status: 'execution-held',
          taskKey: task.taskKey,
          reason: result.reason,
        };
      const outcome = signOutcomeV3(
        task,
        result,
        outcomePrivateKey,
        outcomeKeyId
      );
      validateOutcomeV3(outcome, task, outcomePublicKey);
      state = {
        ...state,
        active: {
          phase: 'outcome-pending',
          taskKey: task.taskKey,
          record: state.active.record,
          outcome,
        },
      };
      journal.write(state);
    }
    validateOutcomeV3(state.active.outcome, task, outcomePublicKey);
    const acknowledgement = await transport.writeOutcome(state.active.outcome);
    if (journal.clear) journal.clear(task.taskKey);
    else journal.write(emptyState());
    return {
      status: 'execution-recorded',
      taskKey: task.taskKey,
      acknowledgement: acknowledgement.status,
    };
  }
  if (
    !projector ||
    !outcomePrivateKey ||
    !outcomePublicKey ||
    !KEY_ID.test(outcomeKeyId ?? '')
  ) {
    throw new Error('v2-execution-configuration-missing');
  }
  if (state.active.phase === 'discovered') {
    let issue;
    try {
      issue = await projector.project(task);
    } catch (error) {
      if (error?.message === OPEN_CHILD_BUDGET) {
        return {
          status: 'projection-held',
          taskKey: task.taskKey,
          reason: OPEN_CHILD_BUDGET,
        };
      }
      throw error;
    }
    const outcome = signOutcomeV2(task, issue, outcomePrivateKey, outcomeKeyId);
    validateOutcomeV2(outcome, task, outcomePublicKey);
    state = {
      ...state,
      active: {
        phase: 'outcome-pending',
        taskKey: task.taskKey,
        record: state.active.record,
        outcome,
      },
    };
    journal.write(state);
  }
  validateOutcomeV2(state.active.outcome, task, outcomePublicKey);
  const acknowledgement = await transport.writeOutcome(state.active.outcome);
  if (journal.clear) journal.clear(task.taskKey);
  else journal.write(emptyState());
  return {
    status: 'projection-recorded',
    taskKey: task.taskKey,
    issueIdentifier: state.active.outcome.result.issueIdentifier,
    acknowledgement: acknowledgement.status,
    action: task.action,
    sourceVersion: task.source.sourceVersion,
    snapshotDigest: task.source.snapshotDigest,
  };
}

async function boundedJsonBody(response, prefix) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > RESPONSE_BYTE_LIMIT) {
    throw new Error(`${prefix}-response-too-large`);
  }
  try {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('summer-outbox-invalid-json');
    const chunks = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > RESPONSE_BYTE_LIMIT) {
        await reader.cancel();
        throw new Error(`${prefix}-response-too-large`);
      }
      chunks.push(value);
    }
    const bytes = Buffer.concat(
      chunks.map(chunk => Buffer.from(chunk)),
      length
    );
    return JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    if (error?.message === `${prefix}-response-too-large`) throw error;
    throw new Error(`${prefix}-invalid-json`);
  }
}

async function responseJson(response) {
  if (!response.ok) throw new Error(`summer-outbox-http-${response.status}`);
  return boundedJsonBody(response, 'summer-outbox');
}

async function linearGraphql(config, query, variables, fetchImpl) {
  const response = await fetchImpl(config.linearOrigin, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      authorization: config.linearApiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error(`linear-http-${response.status}`);
  const payload = await boundedJsonBody(response, 'linear');
  if (
    payload === null ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    (Array.isArray(payload.errors) && payload.errors.length > 0) ||
    payload.data === null ||
    typeof payload.data !== 'object'
  ) {
    throw new Error('linear-graphql-rejected');
  }
  return payload.data;
}

function linearMarkdown(value) {
  return String(value ?? '')
    .replace(/\\\[/g, '[')
    .replace(/\\\]/g, ']');
}

function validateProjectedIssue(issue, projection) {
  const labels = issue?.labels?.nodes?.map(label => label?.name);
  if (
    typeof issue?.id !== 'string' ||
    !/^JOV-[1-9][0-9]*$/u.test(issue?.identifier ?? '') ||
    issue.identifier === projection.parentIssue ||
    issue.title !== projection.title ||
    linearMarkdown(issue.description) !== projection.description ||
    !validTimestamp(issue.createdAt) ||
    issue.parent?.identifier !== projection.parentIssue ||
    issue.team?.key !== projection.team ||
    issue.state?.name !== projection.initialState ||
    !Array.isArray(labels) ||
    labels.length !== 1 ||
    labels[0] !== projection.labels[0]
  ) {
    throw new Error('linear-projection-result-cross-bound');
  }
  return issue;
}

export function countOpenSummerChildren(nodes) {
  if (
    !Array.isArray(nodes) ||
    nodes.some(
      node =>
        typeof node?.identifier !== 'string' ||
        typeof node?.title !== 'string' ||
        typeof node?.state?.name !== 'string'
    )
  )
    throw new Error('linear-projection-child-evidence-invalid');
  return nodes.filter(
    node =>
      node.title.startsWith('[summer-task:') &&
      !['Done', 'Canceled'].includes(node.state.name)
  ).length;
}

async function requireChildCapacity(config, parent, fetchImpl) {
  let connection = parent.children;
  let openCount = 0;
  const cursors = new Set();
  const identifiers = new Set();
  for (let page = 0; page < MAX_PAGES; page += 1) {
    openCount += countOpenSummerChildren(connection?.nodes);
    for (const node of connection.nodes) {
      if (identifiers.has(node.identifier))
        throw new Error('linear-projection-child-evidence-invalid');
      identifiers.add(node.identifier);
    }
    if (openCount >= MAX_OPEN_SUMMER_CHILDREN)
      throw new Error(OPEN_CHILD_BUDGET);
    if (typeof connection.pageInfo?.hasNextPage !== 'boolean') {
      throw new Error('linear-projection-child-evidence-invalid');
    }
    if (!connection.pageInfo.hasNextPage) return;
    const cursor = connection.pageInfo.endCursor;
    if (
      typeof cursor !== 'string' ||
      !cursor ||
      cursors.has(cursor) ||
      page + 1 === MAX_PAGES
    ) {
      throw new Error('linear-projection-child-evidence-incomplete');
    }
    cursors.add(cursor);
    const next = await linearGraphql(
      config,
      `query SummerChildren($parentIssue: String!, $after: String!) {
        parent: issue(id: $parentIssue) {
          id identifier
          children(first: 50, after: $after, filter: { state: { type: { nin: ["completed", "canceled"] } } }) {
            nodes { identifier title state { name } }
            pageInfo { hasNextPage endCursor }
          }
        }
      }`,
      { parentIssue: parent.identifier, after: cursor },
      fetchImpl
    );
    if (
      next.parent?.id !== parent.id ||
      next.parent?.identifier !== parent.identifier
    ) {
      throw new Error('linear-projection-child-evidence-invalid');
    }
    connection = next.parent.children;
  }
}

export function createLinearProjector(config, fetchImpl = fetch) {
  return {
    async project(task) {
      validateTask(task);
      if (task.schema !== 'jovie-symphony-repair-task/v2') {
        throw new Error('linear-projection-v2-required');
      }
      const projection = task.linearProjection;
      const prepared = await linearGraphql(
        config,
        `query SummerProjection($teamKey: String!, $parentIssue: String!, $title: String!) {
          teams(filter: { key: { eq: $teamKey } }, first: 2) {
            nodes {
              id
              key
              states(filter: { name: { eq: "Todo" } }, first: 2) { nodes { id name } }
              labels(filter: { name: { eq: "symphony" } }, first: 2) { nodes { id name } }
            }
          }
          parent: issue(id: $parentIssue) {
            id identifier
            children(first: 50, filter: { state: { type: { nin: ["completed", "canceled"] } } }) {
              nodes { identifier title state { name } }
              pageInfo { hasNextPage endCursor }
            }
          }
          issues(filter: { team: { key: { eq: $teamKey } }, title: { eq: $title } }, first: 10) {
            nodes {
              id identifier title description createdAt
              parent { identifier }
              team { key }
              state { name }
              labels(first: 10) { nodes { name } }
            }
          }
        }`,
        {
          teamKey: projection.team,
          parentIssue: projection.parentIssue,
          title: projection.title,
        },
        fetchImpl
      );
      const teams = prepared.teams?.nodes;
      const team = Array.isArray(teams) && teams.length === 1 ? teams[0] : null;
      const states = team?.states?.nodes;
      const labels = team?.labels?.nodes;
      if (
        team?.key !== projection.team ||
        prepared.parent?.identifier !== projection.parentIssue ||
        !Array.isArray(states) ||
        states.length !== 1 ||
        states[0]?.name !== projection.initialState ||
        !Array.isArray(labels) ||
        labels.length !== 1 ||
        labels[0]?.name !== projection.labels[0]
      ) {
        throw new Error('linear-projection-destination-unavailable');
      }
      const existing = prepared.issues?.nodes;
      if (!Array.isArray(existing) || existing.length > 1) {
        throw new Error('linear-projection-replay-conflict');
      }
      if (existing.length === 1) {
        return validateProjectedIssue(existing[0], projection);
      }
      await requireChildCapacity(config, prepared.parent, fetchImpl);
      const created = await linearGraphql(
        config,
        `mutation SummerProjectionCreate($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            success
            issue {
              id identifier title description createdAt
              parent { identifier }
              team { key }
              state { name }
              labels(first: 10) { nodes { name } }
            }
          }
        }`,
        {
          input: {
            teamId: team.id,
            parentId: prepared.parent.id,
            stateId: states[0].id,
            labelIds: [labels[0].id],
            title: projection.title,
            description: projection.description,
          },
        },
        fetchImpl
      );
      if (created.issueCreate?.success !== true) {
        throw new Error('linear-projection-create-rejected');
      }
      return validateProjectedIssue(created.issueCreate.issue, projection);
    },
  };
}

function assertTaskRecordScope(task, issueIdentifier) {
  validateTask(task);
  if (
    task.schema !== 'jovie-symphony-repair-task/v2' ||
    ![
      'reconcile-native-queue-starvation',
      'reconcile-release-certification-starvation',
    ].includes(task.action) ||
    task.linearProjection.parentIssue !== 'JOV-5853' ||
    !/^JOV-[1-9][0-9]*$/u.test(issueIdentifier ?? '') ||
    issueIdentifier === 'JOV-5853'
  ) {
    throw new Error('task-record-read-scope-invalid');
  }
}

export function validateTaskRecords(value, task, issueIdentifier, config) {
  assertTaskRecordScope(task, issueIdentifier);
  if (
    !exactKeys(value, [
      'schema',
      'taskKey',
      'issueIdentifier',
      'state',
      'outbox',
      'projection',
      'execution',
    ]) ||
    value.schema !== 'summer.symphony-task-records/v1' ||
    value.taskKey !== task.taskKey ||
    value.issueIdentifier !== issueIdentifier ||
    canonical(verifyOutboxRecord(value.outbox, config.keys)) !== canonical(task)
  ) {
    throw new Error('task-record-read-cross-bound');
  }
  validateOutcomeV2(value.projection, task, config.outcomePublicKey);
  if (
    value.projection.signatureKeyId !== config.outcomeKeyId ||
    value.projection.result.issueIdentifier !== issueIdentifier ||
    Date.parse(value.projection.completedAt) < Date.parse(task.createdAt)
  ) {
    throw new Error('task-record-read-other-host-or-issue');
  }
  if (value.execution === null) {
    if (value.state !== 'execution-missing')
      throw new Error('task-record-read-state-invalid');
    return value;
  }
  const execution = value.execution;
  if (
    !exactKeys(execution, [
      'schema',
      'taskKey',
      'issueIdentifier',
      'action',
      'status',
      'detail',
      'completedAt',
      'claim',
      'execution',
      'source',
      'signatureKeyId',
      'signature',
    ]) ||
    execution.schema !== 'jovie.symphony-native-queue-execution/v1' ||
    execution.action !== task.action ||
    execution.taskKey !== task.taskKey ||
    execution.issueIdentifier !== issueIdentifier ||
    !['succeeded', 'failed'].includes(execution.status) ||
    value.state !== `execution-${execution.status}` ||
    typeof execution.detail !== 'string' ||
    !execution.detail ||
    execution.detail.length > 240 ||
    !validTimestamp(execution.completedAt) ||
    Date.parse(execution.completedAt) < Date.parse(task.createdAt) ||
    Date.parse(execution.completedAt) <
      Date.parse(value.projection.completedAt) ||
    !exactKeys(execution.source, [
      'action',
      'sourceVersion',
      'snapshotDigest',
    ]) ||
    execution.source.action !== task.action ||
    execution.source.sourceVersion !== task.source.sourceVersion ||
    execution.source.snapshotDigest !== task.source.snapshotDigest ||
    !exactKeys(execution.claim, ['state', 'assignee']) ||
    !['Todo', 'In Progress', 'Done'].includes(execution.claim.state) ||
    !(
      execution.claim.assignee === null ||
      (typeof execution.claim.assignee === 'string' &&
        execution.claim.assignee.length > 0 &&
        execution.claim.assignee.length <= 120)
    ) ||
    !exactKeys(execution.execution, [
      'mutationAttempted',
      'authority',
      'pr',
      'head',
    ]) ||
    typeof execution.execution.mutationAttempted !== 'boolean' ||
    ![
      'native-queue-mutation-authority-unavailable',
      'exact-source-ci-native-queue-production-gates-remain-required',
    ].includes(execution.execution.authority) ||
    !(
      execution.execution.pr === null ||
      (Number.isInteger(execution.execution.pr) && execution.execution.pr > 0)
    ) ||
    !(
      execution.execution.head === null || SHA.test(execution.execution.head)
    ) ||
    (execution.status === 'succeeded' && execution.execution.pr === null) ||
    (execution.status === 'failed' &&
      execution.execution.authority ===
        'native-queue-mutation-authority-unavailable' &&
      execution.execution.pr !== null) ||
    execution.signatureKeyId !== config.outcomeKeyId ||
    !SIGNATURE.test(execution.signature ?? '')
  ) {
    throw new Error('task-record-execution-invalid-or-cross-bound');
  }
  const { signature, ...unsigned } = execution;
  if (
    !nodeVerify(
      null,
      Buffer.from(`${execution.schema}\0${canonical(unsigned)}`),
      config.outcomePublicKey,
      Buffer.from(signature.slice('ed25519='.length), 'base64url')
    )
  ) {
    throw new Error('task-record-execution-signature-invalid');
  }
  return value;
}

export function createHttpTransport(config, fetchImpl = fetch) {
  const protectionHeaders = config.vercelAutomationBypassSecret
    ? {
        'x-vercel-protection-bypass': config.vercelAutomationBypassSecret,
      }
    : {};
  return {
    async readPage(cursor, limit) {
      const target = `${OUTBOX_PATH}?limit=${limit}${
        cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''
      }`;
      const headers = signedReadHeaders(
        target,
        Date.now(),
        config.outcomePrivateKey,
        config.outcomeKeyId,
        randomBytes(18).toString('base64url')
      );
      return responseJson(
        await fetchImpl(`${config.summerOrigin}${target}`, {
          headers: { ...headers, ...protectionHeaders },
          redirect: 'error',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
      );
    },
    async readTaskRecords(task, issueIdentifier) {
      assertTaskRecordScope(task, issueIdentifier);
      const query = new URLSearchParams({
        taskKey: task.taskKey,
        issueIdentifier,
        sourceVersion: task.source.sourceVersion,
        snapshotDigest: task.source.snapshotDigest,
      });
      const target = `${TASK_RECORDS_PATH}?${query}`;
      const headers = signedReadHeaders(
        target,
        Date.now(),
        config.outcomePrivateKey,
        config.outcomeKeyId,
        randomBytes(18).toString('base64url')
      );
      const value = await responseJson(
        await fetchImpl(`${config.summerOrigin}${target}`, {
          headers: { ...headers, ...protectionHeaders },
          redirect: 'error',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
      );
      return validateTaskRecords(value, task, issueIdentifier, config);
    },
    async writeOutcome(outcome) {
      const acknowledgement = await responseJson(
        await fetchImpl(`${config.summerOrigin}${OUTCOME_PATH}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...protectionHeaders,
          },
          body: JSON.stringify(outcome),
          redirect: 'error',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
      );
      if (
        !exactKeys(acknowledgement, ['schema', 'taskKey', 'status']) ||
        acknowledgement.schema !== 'summer.symphony-outcome-ack/v1' ||
        acknowledgement.taskKey !== outcome.taskKey ||
        !['recorded', 'replay'].includes(acknowledgement.status)
      ) {
        throw new Error('summer-outcome-ack-invalid');
      }
      return acknowledgement;
    },
  };
}

export function configFromEnvironment(environment = process.env) {
  const required = name => {
    const value = environment[name]?.trim();
    if (!value) throw new Error(`missing-${name}`);
    return value;
  };
  const summerOrigin = required('SUMMER_BOTTLENECK_ORIGIN');
  const parsedOrigin = new URL(summerOrigin);
  const normalizedHostname = parsedOrigin.hostname
    .toLowerCase()
    .replace(/\.$/u, '')
    .replace(/^\[|\]$/gu, '');
  if (
    parsedOrigin.protocol !== 'https:' ||
    parsedOrigin.pathname !== '/' ||
    parsedOrigin.search ||
    parsedOrigin.hash ||
    parsedOrigin.username ||
    parsedOrigin.password ||
    parsedOrigin.port ||
    normalizedHostname === 'localhost' ||
    normalizedHostname.endsWith('.localhost') ||
    isIP(normalizedHostname) !== 0
  ) {
    throw new Error('SUMMER_BOTTLENECK_ORIGIN-invalid');
  }
  const workspace = required('GEM_WORKSPACE');
  if (!isAbsolute(workspace)) throw new Error('GEM_WORKSPACE-must-be-absolute');
  const vercelAutomationBypassSecret =
    environment.SUMMER_BOTTLENECK_VERCEL_AUTOMATION_BYPASS_SECRET?.trim() ||
    null;
  if (
    vercelAutomationBypassSecret &&
    (vercelAutomationBypassSecret.length < 16 ||
      vercelAutomationBypassSecret.length > 512 ||
      /[\r\n]/u.test(vercelAutomationBypassSecret))
  ) {
    throw new Error(
      'SUMMER_BOTTLENECK_VERCEL_AUTOMATION_BYPASS_SECRET-invalid'
    );
  }
  const outcomePrivateKey = createPrivateKey(
    required('SUMMER_BOTTLENECK_SYMPHONY_OUTCOME_SIGNING_PRIVATE_KEY')
  );
  if (
    outcomePrivateKey.type !== 'private' ||
    outcomePrivateKey.asymmetricKeyType !== 'ed25519'
  ) {
    throw new Error('outcome-signing-key-invalid');
  }
  const outcomeKeyId = required(
    'SUMMER_BOTTLENECK_SYMPHONY_OUTCOME_SIGNING_KEY_ID'
  );
  if (!KEY_ID.test(outcomeKeyId)) throw new Error('outcome-key-id-invalid');
  const keys = parseVerificationKeys(
    required('SUMMER_BOTTLENECK_EVE_OUTBOX_VERIFICATION_KEYS_JSON')
  );
  const outcomeFingerprint = publicKeyFingerprint(outcomePrivateKey);
  if (
    keys.has(outcomeKeyId) ||
    [...keys.values()].some(
      publicKey => publicKeyFingerprint(publicKey) === outcomeFingerprint
    )
  ) {
    throw new Error('outbox-and-outcome-signing-authority-overlap');
  }
  return {
    summerOrigin: summerOrigin.replace(/\/$/u, ''),
    workspace,
    outcomePrivateKey,
    outcomePublicKey: createPublicKey(outcomePrivateKey),
    outcomeKeyId,
    keys,
    vercelAutomationBypassSecret,
    linearOrigin: 'https://api.linear.app/graphql',
    linearApiKey: environment.SUMMER_LINEAR_GOVERNOR_API_KEY?.trim() || null,
  };
}

async function main() {
  const config = configFromEnvironment();
  const result = await runCycle({
    journal: createFileJournal(
      config.workspace,
      config.keys,
      config.outcomePublicKey
    ),
    transport: createHttpTransport(config),
    keys: config.keys,
    executor: createOwnedRepairExecutor(),
    projector: config.linearApiKey ? createLinearProjector(config) : null,
    outcomePrivateKey: config.outcomePrivateKey,
    outcomePublicKey: config.outcomePublicKey,
    outcomeKeyId: config.outcomeKeyId,
  });
  process.stdout.write(
    `${JSON.stringify({
      schema: 'jovie.summer-symphony-consumer-cycle/v1',
      ...result,
    })}\n`
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await main();
  } catch (error) {
    const reason = String(error?.message || error || 'consumer-failed')
      .replace(/\s+/gu, ' ')
      .slice(0, 240);
    process.stderr.write(
      `SUMMER_SYMPHONY_CONSUMER_REJECTED reason=${JSON.stringify(reason)}\n`
    );
    process.exitCode = 78;
  }
}
