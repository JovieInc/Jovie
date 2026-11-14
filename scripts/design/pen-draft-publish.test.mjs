import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { load as yamlLoad } from 'js-yaml';
import { JOVIE_TEAM_ID } from '../lib/linear-issue-intake.mjs';
import {
  APPROVAL_LABEL,
  APPROVAL_LINE,
  approvalDescription,
  approvalTitle,
  collectFrames,
  frameFromArtifactName,
  pickApprovalIssue,
  publishDrafts,
  runUrlFor,
} from './pen-draft-publish.mjs';

const RUN_URL = 'https://github.com/JovieInc/Jovie/actions/runs/123';
const UPLOAD_URL = 'https://uploads.example.test/signed/put';
const assetUrl = frame => `https://uploads.linear.app/asset/${frame}.png`;

/** A download-artifact folder: one `pen-draft-<frame>` dir per artifact. */
function artifacts(frames) {
  const dir = mkdtempSync(join(tmpdir(), 'pen-draft-publish-'));
  for (const [artifact, files] of Object.entries(frames)) {
    mkdirSync(join(dir, artifact), { recursive: true });
    for (const file of files)
      writeFileSync(join(dir, artifact, file), `bytes of ${file}`);
  }
  return dir;
}

/** Fake Linear plus its upload host. Records every request it sees. */
function fakeNetwork({ issues = [], failPutFor = [] } = {}) {
  const calls = [];
  const created = [];
  const json = body => ({
    ok: true,
    status: 200,
    headers: new Headers(),
    text: async () => JSON.stringify(body),
  });
  let pendingFrame = null;
  const fetchImpl = async (url, init) => {
    if (init.method === 'PUT') {
      calls.push({ op: 'PUT', url, headers: init.headers, body: init.body });
      const failed = failPutFor.includes(pendingFrame);
      return { ok: !failed, status: failed ? 403 : 200 };
    }
    const { query, variables } = JSON.parse(init.body);
    const op = query.match(/(?:query|mutation)\s+(\w+)/)[1];
    calls.push({ op, variables, authorization: init.headers.Authorization });
    if (op === 'PenDraftPublishRefs')
      return json({
        data: {
          team: {
            states: { nodes: [{ id: 'state-backlog', name: 'Backlog' }] },
          },
          issueLabels: {
            nodes: [
              { id: 'label-workspace', name: APPROVAL_LABEL, team: null },
              {
                id: 'label-team',
                name: APPROVAL_LABEL,
                team: { id: JOVIE_TEAM_ID },
              },
            ],
          },
        },
      });
    if (op === 'PenDraftFileUpload') {
      pendingFrame = variables.filename.replace(/\.png$/, '');
      return json({
        data: {
          fileUpload: {
            success: true,
            uploadFile: {
              uploadUrl: UPLOAD_URL,
              assetUrl: assetUrl(pendingFrame),
              headers: [{ key: 'x-amz-acl', value: 'private' }],
            },
          },
        },
      });
    }
    if (op === 'PenDraftApprovalIssue')
      return json({ data: { issues: { nodes: [...issues, ...created] } } });
    if (op === 'PenDraftApprovalCreate') {
      const issue = {
        id: `new-${created.length}`,
        identifier: `JOV-90${created.length}`,
        title: variables.input.title,
        state: { type: 'backlog' },
        labels: { nodes: variables.input.labelIds.map(id => ({ id })) },
      };
      created.push(issue);
      return json({ data: { issueCreate: { success: true, issue } } });
    }
    if (op === 'PenDraftApprovalUpdate')
      return json({
        data: { issueUpdate: { success: true, issue: { id: variables.id } } },
      });
    throw new Error(`unexpected Linear operation ${op}`);
  };
  return { fetchImpl, calls, ops: () => calls.map(call => call.op) };
}

const publish = (dir, network, extra = {}) =>
  publishDrafts({
    dir,
    runUrl: RUN_URL,
    apiKey: 'lin_api_test',
    fetchImpl: network.fetchImpl,
    env: {
      LINEAR_COOLDOWN_STATE_DIR: mkdtempSync(join(tmpdir(), 'pen-cooldown-')),
    },
    sleep: async () => {},
    log: () => {},
    ...extra,
  });

test('frame names come from pen-draft-<frame> artifact names only', () => {
  assert.equal(frameFromArtifactName('pen-draft-homepage'), 'homepage');
  assert.equal(
    frameFromArtifactName('pen-draft-page-skeletons-2'),
    'page-skeletons-2'
  );
  for (const name of [
    'pen-draft-',
    'pen-draft',
    'pen-drafts-homepage',
    'quality-gaps-123',
    'pen-draft-Bad Name',
    'pen-draft-../etc',
    'pen-draft-a--b',
    'xpen-draft-homepage',
    undefined,
  ])
    assert.equal(frameFromArtifactName(name), null, String(name));
});

test('only pen-draft folders count, and a frame without a png has none', () => {
  const dir = artifacts({
    'pen-draft-homepage': ['homepage.pen', 'homepage.png', 'homepage.json'],
    'pen-draft-claim': ['claim.pen', 'receipt.json'],
    // Another frame's picture in the wrong artifact is not this frame's.
    'pen-draft-insights': ['homepage.png'],
    'coverage-report': ['coverage.png'],
  });
  assert.deepEqual(
    collectFrames(dir).map(entry => [
      entry.frame,
      entry.png?.slice(dir.length + 1) ?? null,
    ]),
    [
      ['claim', null],
      ['homepage', 'pen-draft-homepage/homepage.png'],
      ['insights', null],
    ]
  );
  assert.deepEqual(collectFrames(join(dir, 'missing')), []);
});

test('the approval issue is matched on its exact title', () => {
  assert.equal(approvalTitle('homepage'), 'Pen draft for approval: homepage');
  const node = (id, title, type = 'backlog', createdAt = '2026-11-10') => ({
    id,
    title,
    createdAt,
    state: { type },
  });
  assert.equal(
    pickApprovalIssue(
      [
        node('a', 'Pen draft for approval: homepage-v2'),
        node('b', 'Re: Pen draft for approval: homepage'),
        node('c', 'pen draft for approval: homepage'),
      ],
      'homepage'
    ),
    null
  );
  assert.equal(pickApprovalIssue(undefined, 'homepage'), null);
  // An open issue wins over a closed one, then the newest.
  assert.equal(
    pickApprovalIssue(
      [
        node(
          'old-open',
          'Pen draft for approval: homepage',
          'backlog',
          '2026-11-01'
        ),
        node(
          'canceled',
          'Pen draft for approval: homepage',
          'canceled',
          '2026-11-12'
        ),
        node(
          'new-open',
          'Pen draft for approval: homepage',
          'unstarted',
          '2026-11-09'
        ),
      ],
      'homepage'
    ).id,
    'new-open'
  );
});

test('the description holds the picture inline, the run link and the ask', () => {
  assert.equal(
    approvalDescription({
      frame: 'homepage',
      assetUrl: assetUrl('homepage'),
      runUrl: RUN_URL,
    }),
    [
      '![homepage](https://uploads.linear.app/asset/homepage.png)',
      '',
      `Drafted by ${RUN_URL}`,
      '',
      'Move to Todo to accept, cancel to reject.',
    ].join('\n')
  );
  assert.equal(APPROVAL_LINE, 'Move to Todo to accept, cancel to reject.');
  assert.equal(APPROVAL_LABEL, 'pen-draft:needs-tim');
});

test('the approval label has no default on silence and no shared cap', () => {
  // fleet_ledger.py accepts a gate label's default at its deadline, and the
  // quality-gap finder caps issues with its own label. Both match labels by
  // exact name, so the Pen draft label must not be named in either.
  for (const file of [
    'scripts/lanes/fleet_ledger.py',
    'scripts/lanes/workstreams.py',
    'scripts/quality-gap-finder.mjs',
  ])
    assert.equal(
      readFileSync(file, 'utf8').includes(APPROVAL_LABEL),
      false,
      file
    );
  const ledger = readFileSync('scripts/lanes/fleet_ledger.py', 'utf8');
  const gates = ledger.match(/GATE_LABELS = frozenset\(\{([^}]*)\}\)/)[1];
  assert.match(gates, /"quality-gap:needs-tim"/);
  // Exact set membership, not a pattern a new needs-tim label could match.
  assert.match(ledger, /labels & GATE_LABELS/);
});

test('the run link takes a numeric run id only', () => {
  assert.equal(
    runUrlFor('123', {
      GITHUB_SERVER_URL: 'https://github.com',
      GITHUB_REPOSITORY: 'JovieInc/Jovie',
    }),
    RUN_URL
  );
  assert.equal(runUrlFor('123', {}), RUN_URL);
  assert.throws(() => runUrlFor('123/../x', {}), /number/);
  assert.throws(() => runUrlFor(undefined, {}), /number/);
});

test('a new frame uploads its png and gets one labelled Backlog issue', async () => {
  const dir = artifacts({
    'pen-draft-homepage': ['homepage.pen', 'homepage.png'],
  });
  const network = fakeNetwork();
  const result = await publish(dir, network);
  assert.deepEqual(result, {
    ok: true,
    frames: [
      { frame: 'homepage', ok: true, action: 'created', identifier: 'JOV-900' },
    ],
  });
  assert.deepEqual(network.ops(), [
    'PenDraftPublishRefs',
    'PenDraftFileUpload',
    'PUT',
    'PenDraftApprovalIssue',
    'PenDraftApprovalCreate',
  ]);
  const [, sign, put, find, create] = network.calls;
  assert.deepEqual(sign.variables, {
    contentType: 'image/png',
    filename: 'homepage.png',
    size: readFileSync(join(dir, 'pen-draft-homepage/homepage.png')).length,
  });
  assert.equal(put.url, UPLOAD_URL);
  assert.equal(put.headers['Content-Type'], 'image/png');
  assert.equal(put.headers['x-amz-acl'], 'private');
  assert.equal(String(put.body), 'bytes of homepage.png');
  assert.deepEqual(find.variables, {
    teamId: JOVIE_TEAM_ID,
    title: 'Pen draft for approval: homepage',
  });
  assert.deepEqual(create.variables.input, {
    teamId: JOVIE_TEAM_ID,
    title: 'Pen draft for approval: homepage',
    description: approvalDescription({
      frame: 'homepage',
      assetUrl: assetUrl('homepage'),
      runUrl: RUN_URL,
    }),
    labelIds: ['label-team'],
    stateId: 'state-backlog',
  });
  // The key goes to Linear only, never to the upload host.
  assert.equal(sign.authorization, 'lin_api_test');
  assert.equal(put.headers.Authorization, undefined);
});

test('a frame published twice updates its issue and never makes a second', async () => {
  const dir = artifacts({ 'pen-draft-homepage': ['homepage.png'] });
  const network = fakeNetwork();
  await publish(dir, network);
  const again = await publish(dir, network);
  assert.deepEqual(again.frames, [
    { frame: 'homepage', ok: true, action: 'updated', identifier: 'JOV-900' },
  ]);
  assert.equal(
    network.ops().filter(op => op === 'PenDraftApprovalCreate').length,
    1
  );
  const update = network.calls
    .filter(call => call.op === 'PenDraftApprovalUpdate')
    .at(-1);
  // The label is already on the issue, so only the description changes.
  assert.deepEqual(update.variables, {
    id: 'new-0',
    input: {
      description: approvalDescription({
        frame: 'homepage',
        assetUrl: assetUrl('homepage'),
        runUrl: RUN_URL,
      }),
    },
  });
});

test('an existing issue that lost the label gets it back on update', async () => {
  const dir = artifacts({ 'pen-draft-claim': ['claim.png'] });
  const network = fakeNetwork({
    issues: [
      {
        id: 'issue-claim',
        identifier: 'JOV-77',
        title: 'Pen draft for approval: claim',
        state: { type: 'backlog' },
        labels: { nodes: [] },
      },
      {
        id: 'issue-other',
        identifier: 'JOV-78',
        title: 'Pen draft for approval: claim-v2',
        state: { type: 'backlog' },
        labels: { nodes: [] },
      },
    ],
  });
  const result = await publish(dir, network);
  assert.deepEqual(result.frames, [
    { frame: 'claim', ok: true, action: 'updated', identifier: 'JOV-77' },
  ]);
  const update = network.calls.find(
    call => call.op === 'PenDraftApprovalUpdate'
  );
  assert.equal(update.variables.id, 'issue-claim');
  assert.deepEqual(update.variables.input.addedLabelIds, ['label-team']);
  assert.equal(network.ops().includes('PenDraftApprovalCreate'), false);
});

test('a failed upload fails the run, writes no issue, and other frames still publish', async () => {
  const dir = artifacts({
    'pen-draft-claim': ['claim.png'],
    'pen-draft-homepage': ['homepage.png'],
    'pen-draft-insights': ['insights.pen'],
  });
  const network = fakeNetwork({ failPutFor: ['claim'] });
  const result = await publish(dir, network);
  assert.equal(result.ok, false);
  assert.deepEqual(result.frames, [
    { frame: 'insights', ok: true, action: 'skipped-no-png' },
    { frame: 'claim', ok: false, reason: 'pen_upload_put_403' },
    { frame: 'homepage', ok: true, action: 'created', identifier: 'JOV-900' },
  ]);
  const titles = network.calls
    .filter(call => call.op === 'PenDraftApprovalIssue')
    .map(call => call.variables.title);
  assert.deepEqual(titles, ['Pen draft for approval: homepage']);
});

test('no png means no Linear call; a png without the key fails', async () => {
  const none = fakeNetwork();
  assert.deepEqual(
    await publish(artifacts({ 'pen-draft-claim': ['claim.pen'] }), none),
    {
      ok: true,
      frames: [{ frame: 'claim', ok: true, action: 'skipped-no-png' }],
    }
  );
  assert.deepEqual(none.ops(), []);
  const keyless = fakeNetwork();
  const result = await publish(
    artifacts({ 'pen-draft-claim': ['claim.png'] }),
    keyless,
    {
      apiKey: '',
    }
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing_linear_api_key');
  assert.deepEqual(keyless.ops(), []);
});

test('the workflow publishes the run that drafted, with read-only tokens', () => {
  /** @type {(file: string) => any} */
  const parsed = file => yamlLoad(readFileSync(file, 'utf8'));
  const draft = parsed('.github/workflows/pen-draft.yml');
  const workflow = parsed('.github/workflows/pen-draft-publish.yml');
  assert.deepEqual(workflow.on.workflow_run, {
    workflows: [draft.name],
    types: ['completed'],
    branches: ['main'],
  });
  assert.equal(workflow.on.workflow_dispatch.inputs.run_id.required, true);
  assert.deepEqual(workflow.permissions, {});
  const job = workflow.jobs.publish;
  assert.deepEqual(job.permissions, { actions: 'read', contents: 'read' });
  const download = job.steps.find(step =>
    String(step.uses ?? '').startsWith('actions/download-artifact@')
  );
  assert.match(download.uses, /^actions\/download-artifact@[0-9a-f]{40}$/);
  assert.equal(download.with.pattern, 'pen-draft-*');
  assert.match(download.with['run-id'], /RUN_ID|run_id/);
  assert.ok(download.with['github-token']);
  const publishStep = job.steps.find(step =>
    String(step.run ?? '').includes('scripts/design/pen-draft-publish.mjs')
  );
  // The step that holds the Linear key holds nothing else.
  assert.deepEqual(Object.keys(publishStep.env), ['LINEAR_API_KEY']);
  assert.match(job.env.RUN_ID, /inputs\.run_id/);
  assert.match(job.env.RUN_ID, /github\.event\.workflow_run\.id/);
});
