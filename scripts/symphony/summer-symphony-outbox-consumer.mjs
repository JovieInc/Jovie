#!/usr/bin/env node
/**
 * Authenticate and durably discover one Summer-to-Symphony v1 outbox task.
 *
 * The v1 task's `issue: "JOV-5853"` is provenance, not an execution target.
 * This consumer therefore holds a verified task after discovery. It performs no
 * Linear mutation, Symphony dispatch, or outcome acknowledgement until a later
 * versioned wire schema supplies an explicit target and decision fingerprint.
 */

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  sign as nodeSign,
  verify as nodeVerify,
} from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  fsyncSync,
  lstatSync,
  linkSync,
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
import { dirname, isAbsolute, join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export const READ_DOMAIN = 'summer.symphony-outbox-read/v1';
export const OUTBOX_DOMAIN = 'jovie.eve.symphony-repair-outbox/v1';
export const OUTBOX_DOMAIN_V2 = 'jovie.eve.symphony-repair-outbox/v2';
export const OUTCOME_DOMAIN_V2 = 'jovie.symphony-repair-outcome/v2';
export const PAGE_SCHEMA = 'summer.symphony-outbox-page/v1';
export const STATE_SCHEMA = 'jovie.summer-symphony-consumer-state/v1';
export const DISCOVERY_CURSOR_SCHEMA =
  'jovie.summer-symphony-discovery-cursor/v1';
export const OUTBOX_PATH = '/summer/v1/symphony/outbox';
export const OUTCOME_PATH = '/summer/v1/symphony/outcomes';
export const EXECUTION_HOLD =
  'v1-missing-explicit-execution-target-and-decision-fingerprint';

const DIGEST = /^[a-f0-9]{64}$/u;
const SHA = /^[a-f0-9]{40}$/u;
const KEY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/u;
const SIGNATURE = /^ed25519=[A-Za-z0-9_-]{86}$/u;
const MAX_PAGES = 4;
const PAGE_LIMIT = 25;
const RESPONSE_BYTE_LIMIT = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const ACTIONS = new Set([
  'reconcile-release-certification-starvation',
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

function exactKeys(value, keys) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join('\0') === [...keys].sort().join('\0')
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

/** Match the private Summer v1 Zod contract without importing private code. */
export function validateTask(task) {
  const isV1 = task?.schema === 'jovie-symphony-repair-task/v1';
  const isV2 = task?.schema === 'jovie-symphony-repair-task/v2';
  if (
    (!isV1 && !isV2) ||
    !exactKeys(task, [
      'schema',
      'taskKey',
      ...(isV2 ? ['decisionFingerprint'] : []),
      'createdAt',
      'owner',
      'route',
      'authority',
      'action',
      ...(isV1 ? ['issue'] : ['linearProjection']),
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
    !ACTIONS.has(task.action) ||
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
    !/^[A-Za-z0-9][A-Za-z0-9:#/_-]{1,127}$/u.test(
      task.selected.handle ?? ''
    ) ||
    !SHA.test(task.source.sourceVersion ?? '') ||
    !DIGEST.test(task.source.snapshotDigest ?? '') ||
    task.selected.sourceRevision !== task.source.sourceVersion
  ) {
    throw new Error('outbox-task-invalid-or-cross-bound');
  }
  const release = task.selected.id === 'release-certification-starvation';
  if (
    (release && task.action !== 'reconcile-release-certification-starvation') ||
    (!release &&
      (!CI_IDS.has(task.selected.id) ||
        task.action !== 'remediate-selected-ci-audit-class'))
  ) {
    throw new Error('outbox-task-action-cross-bound');
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
    if (publicKey.type !== 'public' || publicKey.asymmetricKeyType !== 'ed25519') {
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

/** Verify the outer signature and all inner source/action/task bindings. */
export function verifyOutboxRecord(record, keys) {
  const domain =
    record?.schema === OUTBOX_DOMAIN
      ? OUTBOX_DOMAIN
      : record?.schema === OUTBOX_DOMAIN_V2
        ? OUTBOX_DOMAIN_V2
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
      task.schema !== 'jovie-symphony-repair-task/v2')
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

/** Follow corrupt-only pages and return at most one independently verified task. */
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
  const error = new Error('outbox-page-limit-exceeded');
  error.nextCursor = cursor;
  throw error;
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
    validateOutcomeV2(state.active.outcome, task, outcomePublicKey);
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
      (typeof process.getuid === 'function' && metadata.uid !== process.getuid())
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
    for (const [candidate, mode] of [
      [sharedStateDirectory, null],
      [privateStateDirectory, 0o700],
    ]) {
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
      (typeof process.getuid === 'function' && metadata.uid !== process.getuid())
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
        return validateState(
          readOwnedJson(path),
          keys,
          outcomePublicKey
        );
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

/** WIP=1. Replays return the identical held task and make no provider write. */
export async function runCycle({
  journal,
  transport,
  keys,
  projector,
  outcomePrivateKey,
  outcomePublicKey,
  outcomeKeyId,
}) {
  let state = journal.read();
  if (
    state.active?.record?.task?.schema === 'jovie-symphony-repair-task/v1'
  ) {
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
        error?.message !== 'outbox-page-limit-exceeded' ||
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
  if (
    !projector ||
    !outcomePrivateKey ||
    !outcomePublicKey ||
    !KEY_ID.test(outcomeKeyId ?? '')
  ) {
    throw new Error('v2-execution-configuration-missing');
  }
  if (state.active.phase === 'discovered') {
    const issue = await projector.project(task);
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
    const bytes = Buffer.concat(chunks.map(chunk => Buffer.from(chunk)), length);
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

function validateProjectedIssue(issue, projection) {
  const labels = issue?.labels?.nodes?.map(label => label?.name);
  if (
    typeof issue?.id !== 'string' ||
    !/^JOV-[1-9][0-9]*$/u.test(issue?.identifier ?? '') ||
    issue.identifier === projection.parentIssue ||
    issue.title !== projection.title ||
    issue.description !== projection.description ||
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
          parent: issue(id: $parentIssue) { id identifier }
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

export function createHttpTransport(config, fetchImpl = fetch) {
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
          headers,
          redirect: 'error',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
      );
    },
    async writeOutcome(outcome) {
      const acknowledgement = await responseJson(
        await fetchImpl(`${config.summerOrigin}${OUTCOME_PATH}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
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
