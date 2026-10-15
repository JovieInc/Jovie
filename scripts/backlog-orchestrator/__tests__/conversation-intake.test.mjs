import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  intentSimilarity,
  normalizeIntent,
  reconcileConversationRequest,
} from '../conversation-intake.mjs';
import {
  classifyConversationRequest,
  externalizeConversationRequest,
  resumePrivateTask,
} from '../private-task.mjs';

const request = {
  title: 'Archive stale Jovie reports',
  summary: 'Jovie report cleanup was requested again.',
  conversationReceipt: {
    id: 'conversation-20260727-4',
    url: 'https://example.test/conversations/20260727#4',
  },
  evidence: [{ url: 'https://example.test/audit/20260727' }],
};

function client(issues) {
  const calls = { comments: [], creates: [] };
  return {
    calls,
    async fetchTeamActiveIssueSnapshot() {
      return {
        issues,
        coverage: { complete: true, pages: 1, scanned: issues.length },
      };
    },
    async addComment(id, body) {
      calls.comments.push({ id, body });
      return { commentCreate: { success: true } };
    },
    async createIssue(input) {
      calls.creates.push(input);
      return {
        issueCreate: {
          issue: {
            id: 'new-id',
            identifier: 'JOV-5000',
            url: 'https://linear.app/jovie/issue/JOV-5000/new',
            state: { name: 'Triage' },
          },
        },
      };
    },
  };
}

describe('conversation issue reconciliation', () => {
  it('normalizes wording and scores repeated intent highly', () => {
    assert.deepEqual(normalizeIntent('Requested: archiving Telegram chats'), [
      'archiv',
      'chat',
      'telegram',
    ]);
    assert.ok(
      intentSimilarity(
        'Archive stale Telegram chats',
        'Missed Telegram chat archiving never completed despite 5 requests'
      ) >= 0.82
    );
  });

  it('links new evidence to one canonical open issue and reports its state', async () => {
    const api = client([
      {
        id: 'existing-id',
        identifier: 'JOV-4423',
        title: 'Missed Jovie report archiving never completed despite requests',
        description: '',
        url: 'https://linear.app/jovie/issue/JOV-4423/existing',
        state: { name: 'Todo' },
        comments: { nodes: [] },
      },
    ]);
    const receipt = await reconcileConversationRequest({
      request,
      teamId: 'team',
      stateId: 'triage',
      client: api,
    });

    assert.equal(receipt.disposition, 'existing_issue');
    assert.ok('canonicalIssue' in receipt);
    assert.equal(receipt.canonicalIssue.identifier, 'JOV-4423');
    assert.equal(receipt.canonicalIssue.state, 'Todo');
    assert.deepEqual(receipt.counts, {
      canonicalMatches: 1,
      reviewCandidates: 0,
      issuesCreated: 0,
      receiptsLinked: 1,
    });
    assert.equal(api.calls.creates.length, 0);
    assert.match(api.calls.comments[0].body, /Jovie report cleanup/);
    assert.doesNotMatch(api.calls.comments[0].body, /conversations\/|audit\//);
  });

  it('is idempotent for a receipt already attached to the canonical issue', async () => {
    const api = client([
      {
        id: 'existing-id',
        identifier: 'JOV-4423',
        title: 'Archive stale Jovie reports',
        url: 'https://linear.app/jovie/issue/JOV-4423/existing',
        state: { name: 'In Progress' },
        comments: {
          nodes: [
            {
              body: '<!-- conversation-receipt:fb9f3950e1a099fe -->',
            },
          ],
        },
      },
    ]);
    const first = await reconcileConversationRequest({
      request,
      teamId: 'team',
      stateId: 'triage',
      client: api,
    });
    api.calls.comments.length = 0;
    api.calls.comments.push({
      body: `<!-- conversation-receipt:${first.receiptKey} -->`,
    });
    api.fetchTeamActiveIssueSnapshot = async () => ({
      issues: [
        {
          id: 'existing-id',
          identifier: 'JOV-4423',
          title: request.title,
          url: 'https://linear.app/jovie/issue/JOV-4423/existing',
          state: { name: 'In Progress' },
          comments: { nodes: api.calls.comments },
        },
      ],
      coverage: { complete: true, pages: 1, scanned: 1 },
    });
    const second = await reconcileConversationRequest({
      request,
      teamId: 'team',
      stateId: 'triage',
      client: api,
    });
    assert.equal(second.mutation, 'already_linked');
    assert.equal(second.counts.receiptsLinked, 0);
    assert.equal(api.calls.comments.length, 1);
  });

  it('fails closed for a near duplicate below the safe merge threshold', async () => {
    const api = client([
      {
        id: 'candidate-id',
        identifier: 'JOV-4425',
        title: 'Archive Jovie cleanup health',
        url: 'https://linear.app/jovie/issue/JOV-4425/candidate',
        state: { name: 'Triage' },
        comments: { nodes: [] },
      },
    ]);
    const receipt = await reconcileConversationRequest({
      request,
      teamId: 'team',
      stateId: 'triage',
      client: api,
    });
    assert.equal(receipt.disposition, 'human_review');
    assert.ok('reviewCandidates' in receipt);
    assert.equal(receipt.mutation, 'none');
    assert.equal(receipt.reviewCandidates[0].identifier, 'JOV-4425');
    assert.equal(api.calls.creates.length, 0);
    assert.equal(api.calls.comments.length, 0);
  });

  it('creates only when the active backlog has materially different intent', async () => {
    const api = client([
      {
        id: 'other-id',
        identifier: 'JOV-99',
        title: 'Improve billing invoice retries',
        description: '',
        url: 'https://linear.app/jovie/issue/JOV-99/other',
        state: { name: 'Todo' },
      },
    ]);
    const receipt = await reconcileConversationRequest({
      request,
      teamId: 'team',
      stateId: 'triage',
      client: api,
    });
    assert.equal(receipt.disposition, 'new_issue');
    assert.ok('canonicalIssue' in receipt);
    assert.equal(receipt.canonicalIssue.identifier, 'JOV-5000');
    assert.equal(api.calls.creates.length, 1);
    assert.match(api.calls.creates[0].description, /Conversation receipts/);
  });

  it('rejects incomplete open-issue coverage before mutation', async () => {
    const api = client([]);
    api.fetchTeamActiveIssueSnapshot = async () => ({
      issues: [],
      coverage: { complete: false, pages: 0, scanned: 0 },
    });
    await assert.rejects(
      reconcileConversationRequest({
        request,
        teamId: 'team',
        stateId: 'triage',
        client: api,
      }),
      /snapshot is incomplete/
    );
    assert.equal(api.calls.creates.length, 0);
  });

  it('does not claim a receipt was linked when Linear rejects the comment', async () => {
    const api = client([
      {
        id: 'existing-id',
        identifier: 'JOV-4423',
        title: request.title,
        url: 'https://linear.app/jovie/issue/JOV-4423/existing',
        state: { name: 'Todo' },
        comments: { nodes: [] },
      },
    ]);
    api.addComment = async () => ({ commentCreate: { success: false } });
    await assert.rejects(
      reconcileConversationRequest({
        request,
        teamId: 'team',
        stateId: 'triage',
        client: api,
      }),
      /receipt link failed/
    );
  });
});

function privateFixture(t) {
  const directory = mkdtempSync(join('/tmp', 'jovie-private-intake-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function storedTask(directory, receipt) {
  return JSON.parse(
    readFileSync(join(directory, `${receipt.taskId}.json`), 'utf8')
  );
}

const personalRequest = {
  title: 'Archive stale Telegram chats',
  recovery: {
    prerequisites: { apiCredentialsAvailable: true, phoneAvailable: true },
    blocker: 'login_code_required',
  },
};

describe('private conversation intake and recovery', () => {
  it('classifies before any tool use and fails unknown/conflicting scope closed', async t => {
    const directory = privateFixture(t);
    for (const [input, expected] of [
      [personalRequest, 'personal'],
      [{ title: 'Improve the Jovie dashboard' }, 'jovie'],
      [{ title: 'Clean my inbox and update Jovie' }, 'mixed'],
      [{ ...personalRequest, classification: 'jovie' }, 'mixed'],
      [{ title: 'Unspecified account workflow' }, 'mixed'],
      [
        {
          title: 'Renew a passport',
          conversationReceipt: { url: 'https://github.com/example' },
        },
        'mixed',
      ],
      [{ title: 'Improve Jovie', classification: 'mixed' }, 'mixed'],
      [{ title: 'Private errand', classification: 'personal' }, 'personal'],
    ]) {
      assert.equal(classifyConversationRequest(input), expected);
      if (expected === 'jovie') continue;
      const receipt = await reconcileConversationRequest({
        request: input,
        privateTaskDirectory: directory,
        client: new Proxy(
          {},
          {
            get() {
              throw new Error('Company tool used');
            },
          }
        ),
      });
      assert.equal(receipt.disposition, 'private_task');
      assert.equal(receipt.externalization, 'denied');
      assert.throws(() => externalizeConversationRequest(input), /denied/);
    }
    assert.throws(
      () =>
        classifyConversationRequest({
          title: 'Jovie',
          classification: 'public',
        }),
      /classification/
    );
    assert.throws(() => classifyConversationRequest(null), /title/);
  });

  it('replays new sessions into one task without repeating escalation or setup', t => {
    const directory = privateFixture(t);
    const first = resumePrivateTask(personalRequest, { directory });
    assert.equal(first.escalation, 'notify_tim_privately');
    assert.deepEqual(storedTask(directory, first).retryBudget, {
      limit: 1,
      remaining: 0,
    });
    assert.throws(
      () =>
        resumePrivateTask(
          { ...personalRequest, recovery: { blocker: 'phone_required' } },
          { directory }
        ),
      /do not request it again/
    );
    // A separate process has no in-memory state from the first invocation.
    const restart = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
      import { resumePrivateTask } from ${JSON.stringify(new URL('../private-task.mjs', import.meta.url).href)};
      const request = { title: 'Telegram inbox cleanup', conversationReceipt: { id: 'new-session' } };
      console.log(JSON.stringify(resumePrivateTask(request, { directory: process.argv[1] })));
    `,
        directory,
      ],
      { encoding: 'utf8' }
    );
    assert.equal(restart.status, 0, restart.stderr);
    const second = JSON.parse(restart.stdout);
    assert.equal(second.taskId, first.taskId);
    assert.equal(second.mutation, 'resumed_private_task');
    assert.equal(second.escalation, 'none');
    const record = storedTask(directory, second);
    assert.deepEqual(record.prerequisites, {
      apiCredentialsAvailable: true,
      phoneAvailable: true,
    });
    assert.equal(record.blocker.code, 'login_code_required');
    assert.equal(record.blocker.owner, 'tim');
    assert.match(record.blocker.exactBlocker, /fresh account login code/);
    assert.match(record.blocker.nextAction, /private login/);
    assert.deepEqual(record.retryBudget, { limit: 1, remaining: 0 });
    assert.equal(readdirSync(directory).length, 1);
    assert.equal(statSync(directory).mode & 0o777, 0o700);
    assert.equal(
      statSync(join(directory, `${first.taskId}.json`)).mode & 0o777,
      0o600
    );
  });

  it('never externalizes or persists raw private inputs in recovery metadata', async t => {
    const directory = privateFixture(t);
    const sensitive = ['synthetic', 'private', 'input'].join('-');
    const input = {
      ...personalRequest,
      phone: ['+1', '202', '555', '0123'].join(''),
      api_hash: 'a'.repeat(32),
      loginCode: sensitive,
      rawTranscript: sensitive,
      accountSession: sensitive,
      recovery: {
        ...personalRequest.recovery,
        prerequisites: {
          apiCredentialsAvailable: true,
          rawTranscript: sensitive,
        },
      },
    };
    const receipt = await reconcileConversationRequest({
      request: input,
      privateTaskDirectory: directory,
    });
    const serialized = JSON.stringify([
      receipt,
      storedTask(directory, receipt),
    ]);
    for (const secret of [input.phone, input.api_hash, sensitive])
      assert.ok(!serialized.includes(secret));
    assert.ok(!serialized.includes('rawTranscript'));
    assert.ok(!serialized.includes('accountSession'));
    assert.ok(!JSON.stringify(receipt).includes('prerequisites'));
    assert.ok(!JSON.stringify(receipt).includes('blocker'));
  });

  it('redacts every company issue/comment projection and drops private evidence/context', async () => {
    const sensitive = ['synthetic', 'credential'].join('-');
    const phone = ['+1', '202', '555', '0123'].join('');
    const input = {
      ...request,
      description: `Fix Jovie retries; api_key=${sensitive}; contact ${phone}; hash ${'b'.repeat(32)}.`,
      summary: `Jovie update api_key=${sensitive}`,
      rawTranscript: sensitive,
      accountSession: sensitive,
      codingAgentPrompt: sensitive,
      evidence: [{ url: `https://example.test/private?token=${sensitive}` }],
    };
    const api = client([]);
    await reconcileConversationRequest({ request: input, client: api });
    const existing = client([
      {
        id: 'same',
        identifier: 'JOV-1',
        title: request.title,
        url: 'https://linear.app/jovie/issue/JOV-1',
      },
    ]);
    await reconcileConversationRequest({ request: input, client: existing });
    const serialized = JSON.stringify([
      api.calls.creates,
      existing.calls.comments,
      externalizeConversationRequest(input),
    ]);
    for (const secret of [
      sensitive,
      phone,
      'b'.repeat(32),
      'example.test',
      'rawTranscript',
      'accountSession',
      'codingAgentPrompt',
    ])
      assert.ok(!serialized.includes(secret), `Leaked ${secret}`);
    assert.match(serialized, /REDACTED/);
  });

  it('records destructive/auth blockers once and permits only non-secret fact updates', t => {
    const directory = privateFixture(t);
    const first = resumePrivateTask(personalRequest, { directory });
    const changed = resumePrivateTask(
      {
        ...personalRequest,
        recovery: {
          blocker: 'destructive_confirmation_required',
          prerequisites: { sessionAvailable: true },
        },
      },
      { directory }
    );
    assert.equal(changed.escalation, 'none');
    assert.equal(storedTask(directory, changed).blocker.owner, 'tim');
    assert.equal(
      storedTask(directory, changed).blocker.code,
      'destructive_confirmation_required'
    );
    assert.equal(
      storedTask(directory, changed).prerequisites.apiCredentialsAvailable,
      true
    );
    assert.equal(
      storedTask(directory, changed).prerequisites.sessionAvailable,
      true
    );
    assert.throws(
      () =>
        resumePrivateTask(
          {
            ...personalRequest,
            recovery: { prerequisites: { phoneAvailable: 'secret' } },
          },
          { directory }
        ),
      /non-secret booleans/
    );
    assert.throws(
      () =>
        resumePrivateTask(
          {
            ...personalRequest,
            recovery: { blocker: 'arbitrary private text' },
          },
          { directory }
        ),
      /Unknown private blocker/
    );
    assert.deepEqual(storedTask(directory, first).retryBudget, {
      limit: 1,
      remaining: 0,
    });
  });

  it('requires a completed live result with Saved Messages delivery before completion', t => {
    const directory = privateFixture(t);
    const reportPath = join(directory, 'report.json');
    const evidence = {
      status: 'completed',
      dry_run: false,
      archived: [],
      summary_message_id: 42,
    };
    const input = {
      ...personalRequest,
      recovery: { verification: { reportPath } },
    };
    const first = resumePrivateTask(personalRequest, { directory });
    for (const report of [
      { ...evidence, dry_run: true },
      { ...evidence, status: 'failed' },
      { ...evidence, summary_message_id: null },
    ]) {
      writeFileSync(reportPath, JSON.stringify(report), { mode: 0o600 });
      assert.throws(
        () => resumePrivateTask(input, { directory }),
        /not verified/
      );
      assert.equal(storedTask(directory, first).status, 'blocked');
    }
    writeFileSync(reportPath, JSON.stringify(evidence));
    const verified = resumePrivateTask(input, { directory });
    assert.equal(verified.status, 'completed');
    assert.equal(storedTask(directory, verified).verification.messageId, 42);
    assert.equal(storedTask(directory, verified).blocker, null);
    assert.equal(
      resumePrivateTask(personalRequest, { directory }).status,
      'completed'
    );
    assert.ok(!JSON.stringify(verified).includes('messageId'));
  });

  it('fails closed on unsafe paths, damaged state and concurrent/interrupted writers', t => {
    const directory = privateFixture(t);
    assert.throws(
      () => resumePrivateTask(personalRequest, { directory: process.cwd() }),
      /outside Git/
    );
    const alias = join(directory, 'alias');
    symlinkSync(directory, alias);
    assert.throws(
      () => resumePrivateTask(personalRequest, { directory: alias }),
      /symlink/
    );
    const first = resumePrivateTask(personalRequest, { directory });
    const recordPath = join(directory, `${first.taskId}.json`);
    const lockPath = join(directory, `${first.taskId}.lock`);
    writeFileSync(lockPath, 'interrupted writer');
    assert.throws(
      () => resumePrivateTask(personalRequest, { directory }),
      /locked/
    );
    rmSync(lockPath);
    writeFileSync(recordPath, JSON.stringify({ schema: 'wrong' }));
    assert.throws(
      () => resumePrivateTask(personalRequest, { directory }),
      /invalid/
    );
    rmSync(recordPath);
    const target = join(directory, 'target');
    writeFileSync(target, '{}');
    symlinkSync(target, recordPath);
    assert.throws(
      () => resumePrivateTask(personalRequest, { directory }),
      /without links/
    );
    rmSync(recordPath);
    mkdirSync(recordPath);
    assert.throws(
      () => resumePrivateTask(personalRequest, { directory }),
      /without links/
    );
  });

  it('dry-runs without writing or consuming escalation and does not complete from a claim', t => {
    const directory = join(privateFixture(t), 'not-created');
    const dry = resumePrivateTask(personalRequest, { directory, dryRun: true });
    assert.equal(dry.mutation, 'none');
    assert.throws(() => statSync(directory), /ENOENT/);
    const blocked = resumePrivateTask(
      { title: 'Personal task', status: 'completed' },
      { directory }
    );
    const record = storedTask(directory, blocked);
    assert.equal(record.status, 'blocked');
    assert.equal(record.blocker.code, 'verification_required');
    assert.equal(record.blocker.owner, 'operator');
    assert.equal(record.retryBudget.remaining, 1);
  });

  it('CLI restart works without company credentials and errors never echo private input', t => {
    const root = privateFixture(t);
    const directory = join(root, 'tasks');
    const evidenceFile = join(root, 'request.json');
    writeFileSync(evidenceFile, JSON.stringify(personalRequest), {
      mode: 0o600,
    });
    const args = [
      'scripts/backlog-orchestrator/backlog-orchestrator.mjs',
      'reconcile-conversation',
      `--evidence-file=${evidenceFile}`,
      `--private-state-dir=${directory}`,
    ];
    const env = { ...process.env };
    delete env.LINEAR_API_KEY;
    for (const expected of ['created_private_task', 'resumed_private_task']) {
      const run = spawnSync(process.execPath, args, { encoding: 'utf8', env });
      assert.equal(run.status, 0, run.stderr);
      assert.equal(JSON.parse(run.stdout).mutation, expected);
      assert.doesNotMatch(run.stdout, /Telegram|login_code|phoneAvailable/);
    }
    const sensitive = ['synthetic', 'private', 'parse-error'].join('-');
    writeFileSync(evidenceFile, `{"title": "${sensitive}" BROKEN`);
    const failed = spawnSync(process.execPath, args, { encoding: 'utf8', env });
    assert.equal(failed.status, 1);
    assert.ok(!`${failed.stdout}${failed.stderr}`.includes(sensitive));
    const receipt = JSON.parse(failed.stderr);
    assert.equal(receipt.status, 'blocked');
    assert.equal(receipt.owner, 'operator');
    assert.equal(receipt.retryBudget, 0);
    assert.ok(receipt.blocker && receipt.nextAction);
    // Existing metadata survives invalid input.
    assert.equal(readdirSync(directory).length, 1);
    chmodSync(evidenceFile, 0o600);
  });
});

it('keeps company dry runs mutation-free and requires receipt identity before tools', async () => {
  const api = client([]);
  const dry = await reconcileConversationRequest({
    request,
    client: api,
    dryRun: true,
  });
  assert.equal(dry.mutation, 'would_create_issue');
  assert.equal(api.calls.creates.length, 0);
  await assert.rejects(
    reconcileConversationRequest({
      request: { title: 'Fix Jovie' },
      client: api,
    }),
    /receipt identity/
  );
});

it('redacts labeled multi-word secrets, blocks, transcripts and standalone codes', () => {
  const sensitive = ['synthetic', 'multi-word', 'credential'].join(' ');
  for (const description of [
    `Authorization: Basic ${sensitive}`,
    `api credentials are ${sensitive}`,
    `\`\`\`\n${sensitive}\n\`\`\``,
    `Raw transcript: ${sensitive}`,
    `Account session state: ${sensitive}`,
  ]) {
    const safe = externalizeConversationRequest({
      title: 'Fix Jovie',
      description,
    });
    assert.ok(!safe.description.includes(sensitive));
    assert.match(safe.description, /REDACTED/);
  }
  const safe = externalizeConversationRequest({
    title: 'Fix Jovie',
    description: `Observed number ${[12, 345].join('')}`,
  });
  assert.match(safe.description, /REDACTED NUMBER/);
});
