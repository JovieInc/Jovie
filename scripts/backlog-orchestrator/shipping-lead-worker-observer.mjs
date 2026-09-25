import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  opendirSync,
  openSync,
  readSync,
  realpathSync,
} from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
import {
  shippingDigest,
  validateShippingTask,
} from '../symphony/summer-shipping-lead-contract.mjs';

const HEX = /^[a-f0-9]{64}$/u;
const SHA = /^(?!0{40})[a-f0-9]{40}$/u;
const ID = /^[A-Za-z0-9_-]{1,256}$/u;
const LIMIT = 1024 * 1024;
const bindingFields =
  'taskDigest issueId identifier invocationId runtimeGeneration workspace producerSha256'.split(
    ' '
  );
const candidateFields =
  'schema threadId turnId sessionId sessionIds threadStartedAt startedAt observedAt executionBaseHead executionFinalHead turnStatus executionTerminated digest'.split(
    ' '
  );
const exitFields =
  'schema candidateDigest sessionId processExitCode launcherExitCode workerProcessExited taskTerminal observedAt digest'.split(
    ' '
  );
const exact = (value, keys) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
const time = value =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(value)
    ? Date.parse(value)
    : NaN;
function check(condition) {
  if (!condition) throw new Error('shipping-lead-worker-evidence-invalid');
}
function validDigest(value) {
  const { digest, ...unsigned } = value;
  return HEX.test(digest ?? '') && shippingDigest(unsigned) === digest;
}

/** Call only with the signed task and journal's independently validated acceptance. */
export function validateShippingWorkerEvidence(
  task,
  acceptance,
  candidate,
  exited,
  producerSha256,
  now = Date.now()
) {
  validateShippingTask(task);
  check(
    exact(candidate, [...bindingFields, ...candidateFields]) &&
      exact(exited, [...bindingFields, ...exitFields])
  );
  check(
    candidate.schema === 'symphony-shipping-worker-candidate/v1' &&
      exited.schema === 'symphony-shipping-worker-exit/v1' &&
      validDigest(candidate) &&
      validDigest(exited)
  );
  const binding = {
    taskDigest: shippingDigest(task),
    issueId: task.issue.id,
    identifier: task.issue.identifier,
    invocationId: task.runtime.invocationId,
    runtimeGeneration: task.runtime.generation,
    producerSha256,
  };
  check(
    HEX.test(producerSha256 ?? '') &&
      Object.entries(binding).every(
        ([key, value]) => candidate[key] === value && exited[key] === value
      )
  );
  check(
    typeof candidate.workspace === 'string' &&
      isAbsolute(candidate.workspace) &&
      basename(candidate.workspace) === task.issue.identifier &&
      !candidate.workspace.split('/').includes('..') &&
      !/[\x00-\x1f]/u.test(candidate.workspace) &&
      exited.workspace === candidate.workspace
  );
  check(
    ID.test(candidate.threadId) &&
      ID.test(candidate.turnId) &&
      candidate.sessionId === `${candidate.threadId}-${candidate.turnId}` &&
      exited.sessionId === candidate.sessionId &&
      exited.candidateDigest === candidate.digest
  );
  check(
    Array.isArray(candidate.sessionIds) &&
      candidate.sessionIds.length > 0 &&
      candidate.sessionIds.length <= 256 &&
      new Set(candidate.sessionIds).size === candidate.sessionIds.length &&
      candidate.sessionIds.every(
        id =>
          typeof id === 'string' &&
          id.startsWith(`${candidate.threadId}-`) &&
          ID.test(id.slice(candidate.threadId.length + 1))
      ) &&
      candidate.sessionIds.includes(candidate.sessionId) &&
      candidate.sessionIds.includes(acceptance.sessionId)
  );
  check(
    acceptance.taskDigest === binding.taskDigest &&
      shippingDigest(acceptance.runtime) === shippingDigest(task.runtime)
  );
  const started = time(candidate.threadStartedAt),
    turn = time(candidate.startedAt),
    completed = time(candidate.observedAt),
    stopped = time(exited.observedAt);
  check(
    started >= Date.parse(task.createdAt) &&
      started <= time(acceptance.observedAt) &&
      turn >= started &&
      completed >= turn &&
      completed >= time(acceptance.observedAt) &&
      stopped >= completed &&
      stopped <= now + 60_000
  );
  check(
    candidate.turnStatus === 'completed' &&
      candidate.executionTerminated === false &&
      exited.workerProcessExited === true &&
      exited.taskTerminal === false &&
      [exited.processExitCode, exited.launcherExitCode].every(
        code => Number.isInteger(code) && code >= 0 && code <= 255
      )
  );
  check(
    SHA.test(candidate.executionBaseHead) &&
      SHA.test(candidate.executionFinalHead) &&
      candidate.executionBaseHead !== candidate.executionFinalHead
  );
  return { candidate, exited };
}

function directory(path) {
  const stat = lstatSync(path);
  check(
    stat.isDirectory() &&
      (stat.mode & 0o777) === 0o700 &&
      stat.uid === process.getuid() &&
      realpathSync(path) === path
  );
}
function read(path) {
  const fd = openSync(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
  );
  try {
    const before = fstatSync(fd, { bigint: true });
    check(
      before.isFile() &&
        (before.mode & 0o777n) === 0o600n &&
        before.uid === BigInt(process.getuid()) &&
        before.nlink === 1n &&
        before.size <= BigInt(LIMIT)
    );
    const bytes = Buffer.alloc(LIMIT + 1);
    let length = 0,
      count;
    do {
      count = readSync(fd, bytes, length, bytes.length - length, null);
      length += count;
    } while (count && length < bytes.length);
    const after = fstatSync(fd, { bigint: true });
    check(
      length <= LIMIT &&
        BigInt(length) === before.size &&
        before.size === after.size &&
        before.mtimeNs === after.mtimeNs &&
        before.ctimeNs === after.ctimeNs
    );
    return JSON.parse(bytes.subarray(0, length).toString('utf8'));
  } finally {
    closeSync(fd);
  }
}

/** Read only this task's private directory; never scan historical tasks or follow payload paths. */
export function readShippingWorkerEvidence(
  task,
  acceptance,
  { privateRoot, producerSha256, now = Date.now() }
) {
  validateShippingTask(task);
  directory(privateRoot);
  const root = join(privateRoot, 'worker-evidence');
  const scoped = join(root, shippingDigest(task));
  let entries;
  try {
    directory(root);
    directory(scoped);
    const handle = opendirSync(scoped);
    entries = [];
    try {
      for (let entry = handle.readSync(); entry; entry = handle.readSync()) {
        check(entries.length < 32);
        entries.push(entry.name);
      }
    } finally {
      handle.closeSync();
    }
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  const candidates = entries.filter(name => /^[a-f0-9]{64}\.json$/u.test(name));
  const exits = entries.filter(name => /^exit-[a-f0-9]{64}\.json$/u.test(name));
  check(
    candidates.length <= 1 &&
      exits.length <= 1 &&
      entries.every(
        name =>
          candidates.includes(name) ||
          exits.includes(name) ||
          name.startsWith('.candidate-')
      )
  );
  if (candidates.length === 0 || exits.length === 0) return null;
  const candidate = read(join(scoped, candidates[0])),
    exited = read(join(scoped, exits[0]));
  check(
    candidates[0] === `${candidate.digest}.json` &&
      exits[0] === `exit-${candidate.digest}.json`
  );
  return validateShippingWorkerEvidence(
    task,
    acceptance,
    candidate,
    exited,
    producerSha256,
    now
  );
}
