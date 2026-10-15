import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const SCHEMA = 'private-task-recovery/v1';
const FACTS = [
  'apiCredentialsAvailable',
  'dependenciesReady',
  'phoneAvailable',
  'sessionAvailable',
];
const BLOCKERS = {
  authentication_required: {
    owner: 'tim',
    exactBlocker:
      'Account authentication must be completed in the private terminal.',
    nextAction:
      'Complete private login once; resume using the saved account session.',
  },
  destructive_confirmation_required: {
    owner: 'tim',
    exactBlocker:
      'The destructive account action requires explicit owner authorization.',
    nextAction:
      'Review the exact action privately and authorize it before execution.',
  },
  login_code_required: {
    owner: 'tim',
    exactBlocker:
      'A fresh account login code is required in the private terminal.',
    nextAction:
      'Complete private login; never send the code to a coding agent or issue.',
  },
  phone_required: {
    owner: 'tim',
    exactBlocker:
      'The private account configuration has no verified phone number.',
    nextAction:
      'Check existing private configuration, then complete missing login input privately.',
  },
  prerequisites_missing: {
    owner: 'operator',
    exactBlocker:
      'Required non-secret setup prerequisites have not been verified.',
    nextAction:
      'Check authorized private configuration before requesting missing setup.',
  },
  session_revoked: {
    owner: 'tim',
    exactBlocker: 'The saved account session was checked and is revoked.',
    nextAction:
      'Reauthorize once in the private terminal and reuse the replacement session.',
  },
  two_factor_required: {
    owner: 'tim',
    exactBlocker:
      'Account two-step verification is required in the private terminal.',
    nextAction:
      'Complete private login without persisting the two-step password.',
  },
  verification_required: {
    owner: 'operator',
    exactBlocker: 'No verified user-visible result has been recorded.',
    nextAction:
      'Verify the account result and private delivery receipt before completion.',
  },
};

function requestText(request) {
  // Include nested evidence/transcripts when deciding privacy, never in output.
  return JSON.stringify(request).normalize('NFKC');
}

/** Unknown or conflicting scope fails closed to mixed/private. */
export function classifyConversationRequest(request) {
  if (!request || typeof request.title !== 'string' || !request.title.trim())
    throw new Error('Conversation request title is required');
  const declared = request.classification;
  if (
    declared !== undefined &&
    !['personal', 'jovie', 'mixed'].includes(declared)
  )
    throw new Error('Invalid conversation classification');
  const text = requestText(request);
  const personal =
    /\b(telegram|personal|private account|my (?:account|inbox|phone|messages)|login code|otp|phone number)\b/i.test(
      text
    );
  // Source URLs and quoted history cannot declare company scope.
  const company =
    /\b(jovie|github|pull request|codebase|regression test)\b/i.test(
      `${request.title} ${request.intent || ''}`
    );
  if (declared === 'mixed' || (personal && (company || declared === 'jovie')))
    return 'mixed';
  if (declared === 'personal' || personal) return 'personal';
  if (declared === 'jovie' || company) return 'jovie';
  return 'mixed';
}

export function redactExternalText(value) {
  return (
    String(value || '')
      .normalize('NFKC')
      // Omit transcript/session blocks rather than trying to recognize their secrets.
      .replace(/```[\s\S]*?```/g, '[REDACTED BLOCK]')
      .replace(
        /\b(?:raw[_ -]?transcript|transcript|account[_ -]?session|session[_ -]?(?:state|string))\b[\s\S]*/gi,
        '[REDACTED PRIVATE CONTEXT]'
      )
      .replace(
        /\b(?:api[_ -]?(?:id|hash|key|credential)s?|token|secret|password|phone|login[_ -]?code|otp|authorization)\b[^\n]*/gi,
        '[REDACTED]'
      )
      .replace(/\bBearer\s+\S+/gi, '[REDACTED]')
      .replace(/https?:\/\/\S+/gi, '[REDACTED LINK]')
      .replace(/\+?\d[\d ().-]{6,}\d/g, '[REDACTED NUMBER]')
      .replace(/\b\d{4,}\b/g, '[REDACTED NUMBER]')
      .replace(/\b[a-f\d]{32,}\b/gi, '[REDACTED CREDENTIAL]')
      .replace(
        /\b(?:sk|ghp|github_pat|xoxb)[_-][\w-]+/g,
        '[REDACTED CREDENTIAL]'
      )
  );
}

/** Only this allowlisted projection may enter issues, PRs or coding prompts. */
export function externalizeConversationRequest(request) {
  if (classifyConversationRequest(request) !== 'jovie')
    throw new Error('Private conversation externalization denied');
  const safe = {};
  for (const key of ['title', 'summary', 'description', 'intent'])
    safe[key] = redactExternalText(request[key]);
  // Raw conversation/audit links can grant access to private history. Never publish them.
  return safe;
}

function outsideGit(path) {
  for (let parent = path; ; parent = dirname(parent)) {
    if (
      (existsSync(join(parent, '.git')) &&
        lstatSync(join(parent, '.git')).isFile()) ||
      existsSync(join(parent, '.git/HEAD')) ||
      (existsSync(join(parent, 'HEAD')) && existsSync(join(parent, 'objects')))
    )
      throw new Error('Private task state must be outside Git');
    if (dirname(parent) === parent) return;
  }
}

function ownedPath(path, directory = false) {
  const info = lstatSync(path);
  if (
    info.isSymbolicLink() ||
    info.uid !== process.getuid() ||
    (directory ? !info.isDirectory() : !info.isFile()) ||
    (!directory && info.nlink !== 1)
  )
    throw new Error('Private task state requires owned files without links');
  chmodSync(path, directory ? 0o700 : 0o600);
}

export function readPrivateConversationRequest(inputPath) {
  const path = resolve(inputPath);
  outsideGit(path);
  if (realpathSync(path) !== path)
    throw new Error('Private conversation input links denied');
  ownedPath(path);
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function defaultPrivateTaskDir() {
  return join(homedir(), '.local/state/jovie/private-tasks');
}

function prepareDirectory(directory) {
  const path = resolve(directory);
  outsideGit(path);
  // Reject symlink ancestors, including aliases back into a checkout.
  for (let parent = path; ; parent = dirname(parent)) {
    if (existsSync(parent) && lstatSync(parent).isSymbolicLink())
      throw new Error('Private task state must not traverse symlinks');
    if (dirname(parent) === parent) break;
  }
  mkdirSync(path, { recursive: true, mode: 0o700 });
  ownedPath(path, true);
  outsideGit(realpathSync(path));
  return path;
}

function writeAtomic(path, record) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  const fd = openSync(temporary, 'wx', 0o600);
  try {
    writeFileSync(fd, `${JSON.stringify(record, null, 2)}\n`);
    fsyncSync(fd);
    renameSync(temporary, path);
  } finally {
    closeSync(fd);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

function taskId(request) {
  const text = `${request.intent || ''} ${request.title}`.toLowerCase();
  // One operation across wording changes and session/receipt IDs.
  const key =
    request.privateTaskKey ||
    (/telegram/.test(text) && /archiv|cleanup|clean up/.test(text)
      ? 'telegram-inbox-cleanup'
      : text.trim().replace(/\s+/g, ' '));
  return createHash('sha256').update(key).digest('hex');
}

function verifyTelegramResult(verification) {
  const path = resolve(verification.reportPath);
  outsideGit(path);
  if (realpathSync(path) !== path)
    throw new Error('Private verification links denied');
  ownedPath(path);
  const report = JSON.parse(readFileSync(path, 'utf8'));
  if (
    report.status !== 'completed' ||
    report.dry_run !== false ||
    !Number.isSafeInteger(report.summary_message_id) ||
    report.summary_message_id <= 0 ||
    !Array.isArray(report.archived)
  )
    throw new Error('User-visible Telegram result is not verified');
  return {
    kind: 'telegram_saved_messages',
    messageId: report.summary_message_id,
    archivedCount: report.archived.length,
    observedAt: new Date().toISOString(),
  };
}

/** Synchronous local transaction: no network, credentials, prompts or raw text. */
export function resumePrivateTask(
  request,
  { directory = defaultPrivateTaskDir(), dryRun = false } = {}
) {
  const classification = classifyConversationRequest(request);
  if (classification === 'jovie')
    throw new Error('Company task is not private');
  const id = taskId(request);
  if (dryRun)
    return {
      disposition: 'private_task',
      classification,
      externalization: 'denied',
      mutation: 'none',
      taskId: id,
    };
  const state = prepareDirectory(directory);
  const path = join(state, `${id}.json`);
  const lock = join(state, `${id}.lock`);
  // Atomic exclusion. A crash leaves a safe, explicit blocker; never reset escalation state.
  let fd;
  try {
    fd = openSync(lock, 'wx', 0o600);
  } catch {
    throw Object.assign(
      new Error(
        'Private task locked; operator must reconcile the interrupted writer'
      ),
      { code: 'PRIVATE_TASK_LOCKED' }
    );
  }
  try {
    writeFileSync(
      fd,
      JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })
    );
    const existing = lstatSync(path, { throwIfNoEntry: false }) !== undefined;
    if (existing) ownedPath(path);
    const record = existing
      ? JSON.parse(readFileSync(path, 'utf8'))
      : {
          schema: SCHEMA,
          taskId: id,
          classification,
          externalization: 'denied',
          prerequisites: {},
          status: 'blocked',
          blocker: null,
          retryBudget: { limit: 1, remaining: 1 },
          escalationRecorded: false,
          createdAt: new Date().toISOString(),
        };
    if (
      record.schema !== SCHEMA ||
      record.taskId !== id ||
      record.externalization !== 'denied' ||
      !['mixed', 'personal'].includes(record.classification) ||
      !['blocked', 'completed'].includes(record.status) ||
      !record.prerequisites ||
      record.retryBudget?.limit !== 1 ||
      ![0, 1].includes(record.retryBudget?.remaining) ||
      typeof record.escalationRecorded !== 'boolean'
    )
      throw new Error(
        'Private recovery record is invalid; preserve it for operator recovery'
      );
    const recovery = request.recovery || {};
    for (const fact of FACTS) {
      const value = recovery.prerequisites?.[fact];
      if (value !== undefined && typeof value !== 'boolean')
        throw new Error('Prerequisites must be non-secret booleans');
      if (value !== undefined) record.prerequisites[fact] = value;
    }
    let escalate = false;
    if (recovery.verification) {
      if (!/telegram/i.test(`${request.title} ${request.intent || ''}`))
        throw new Error('Unsupported private result verification');
      record.verification = verifyTelegramResult(recovery.verification);
      record.status = 'completed';
      record.blocker = null;
    } else if (record.status !== 'completed') {
      const code =
        recovery.blocker || record.blocker?.code || 'verification_required';
      if (!Object.hasOwn(BLOCKERS, code))
        throw new Error('Unknown private blocker');
      if (code === 'phone_required' && record.prerequisites.phoneAvailable)
        throw new Error(
          'Reuse the verified phone prerequisite; do not request it again'
        );
      record.blocker = { code, ...BLOCKERS[code] };
      record.status = 'blocked';
      if (record.blocker.owner === 'tim' && !record.escalationRecorded) {
        record.escalationRecorded = true;
        record.retryBudget.remaining = 0;
        escalate = true;
      }
    }
    record.updatedAt = new Date().toISOString();
    if (classification === 'mixed') record.classification = 'mixed';
    writeAtomic(path, record);
    // Safe receipt only. Read recovery details locally in the private operator session.
    return {
      disposition: 'private_task',
      classification,
      externalization: 'denied',
      taskId: id,
      status: record.status,
      mutation: existing ? 'resumed_private_task' : 'created_private_task',
      escalation: escalate ? 'notify_tim_privately' : 'none',
      issuesCreated: 0,
    };
  } finally {
    closeSync(fd);
    unlinkSync(lock);
  }
}
