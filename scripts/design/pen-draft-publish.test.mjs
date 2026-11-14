import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { load as yamlLoad } from 'js-yaml';
import { JOVIE_TEAM_ID } from '../lib/linear-issue-intake.mjs';
import {
  artifacts,
  assetUrl,
  fakeNetwork,
  fakePng,
  publish,
  RUN_URL,
  UPLOAD_URL,
} from './pen-draft-publish.fixtures.mjs';
import {
  APPROVAL_LABEL,
  APPROVAL_LINE,
  approvalDescription,
  approvalTitle,
  pickApprovalIssue,
  runUrlFor,
} from './pen-draft-publish.mjs';

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
  assert.deepEqual(put.body, fakePng(1440, 900));
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
    { frame: 'claim', ok: false, reason: 'pen_upload_put_403' },
    { frame: 'homepage', ok: true, action: 'created', identifier: 'JOV-900' },
    { frame: 'insights', ok: true, action: 'skipped-no-png' },
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
  assert.match(workflow.env.RUN_ID, /inputs\.run_id/);
  assert.match(workflow.env.RUN_ID, /github\.event\.workflow_run\.id/);
  const { plan, render, publish: job } = workflow.jobs;
  const uses = (steps, action) =>
    steps.find(step => String(step.uses ?? '').startsWith(`${action}@`));
  const runs = (steps, script) =>
    steps.find(step => String(step.run ?? '').includes(script));
  const readOnly = { actions: 'read', contents: 'read' };

  // Plan lists the frames of the drafting run that left a .pen.
  assert.deepEqual(plan.permissions, readOnly);
  const all = uses(plan.steps, 'actions/download-artifact');
  assert.match(all.uses, /^actions\/download-artifact@[0-9a-f]{40}$/);
  assert.equal(all.with.pattern, 'pen-draft-*');
  assert.match(all.with['run-id'], /RUN_ID/);
  assert.ok(all.with['github-token']);
  assert.match(runs(plan.steps, 'pen-draft-picture.mjs').run, /--plan/);

  // One render job per frame, one at a time, under the draft jobs' editor
  // lease: the Pen editor behind one key serves one document.
  assert.equal(render.needs, 'plan');
  assert.deepEqual(render.permissions, readOnly);
  assert.deepEqual(render.concurrency, draft.jobs.draft.concurrency);
  assert.equal(render.strategy['max-parallel'], 1);
  assert.equal(render.strategy['fail-fast'], false);
  assert.match(render.strategy.matrix.frame, /needs\.plan\.outputs\.frames/);
  const download = uses(render.steps, 'actions/download-artifact');
  assert.equal(download.with.name, 'pen-draft-${{ matrix.frame }}');
  // A named artifact unpacks flat, so its path restores the frame's folder.
  assert.match(
    download.with.path,
    /pen-drafts\/pen-draft-\$\{\{ matrix\.frame \}\}$/
  );
  assert.match(download.with['run-id'], /RUN_ID/);
  const renderStep = runs(render.steps, 'scripts/design/pen-draft-picture.mjs');
  assert.deepEqual(Object.keys(renderStep.env), [
    'PEN_CLI_KEY',
    'PEN_GOLDEN_PATH_FILE_URL',
  ]);
  const upload = uses(render.steps, 'actions/upload-artifact');
  assert.ok(render.steps.indexOf(download) < render.steps.indexOf(renderStep));
  assert.ok(render.steps.indexOf(renderStep) < render.steps.indexOf(upload));
  assert.equal(upload.with.name, 'pen-draft-picture-${{ matrix.frame }}');
  // The 25 MB .pen files stay behind; the per-frame folder is kept.
  assert.match(upload.with.path, /pen-drafts\n!.*\*\*\/\*\.pen/);

  // Publish gets only the pictures, holds only the Linear key, and still
  // runs when one frame's render job failed.
  assert.deepEqual(job.needs, ['plan', 'render']);
  assert.match(job.if, /!cancelled\(\)/);
  assert.deepEqual(job.permissions, readOnly);
  const pictures = uses(job.steps, 'actions/download-artifact');
  assert.equal(pictures.with.pattern, 'pen-draft-picture-*');
  assert.equal(pictures.with['merge-multiple'], true);
  assert.equal(pictures.with['run-id'], undefined);
  const publishStep = runs(job.steps, 'scripts/design/pen-draft-publish.mjs');
  assert.deepEqual(Object.keys(publishStep.env), ['LINEAR_API_KEY']);
  assert.equal(JSON.stringify(job).includes('PEN_'), false);
  assert.equal(
    JSON.stringify([plan, render]).includes('LINEAR_API_KEY'),
    false
  );
  // No job outlasts the 10 minutes the publish job always had.
  for (const each of [plan, render, job])
    assert.ok(each['timeout-minutes'] <= 10);
});
