import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { load as yamlLoad } from 'js-yaml';
import { assertEventDrivenLearning } from './lib/learning-trigger.mjs';
import {
  buildReviewReport,
  findUnownedSystemicControls,
  groupFailureClasses,
  isVerifiedActionRow,
  mirrorPostmortem,
  parseActionRows,
  parseSystemicControls,
  readClassActionRegistry,
  readPostmortemDocuments,
  reviewPostmortem,
} from './postmortem-review.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const TARGET_PATH = 'docs/postmortems/2026-09-26-production-freeze.md';

function targetDocument() {
  return {
    path: TARGET_PATH,
    source: readFileSync(resolve(REPO_ROOT, TARGET_PATH), 'utf8'),
  };
}

function actionAudit(labels = ['postmortem-action']) {
  return Object.fromEntries(
    [
      'JOV-6684',
      'JOV-6685',
      'JOV-6686',
      'JOV-6687',
      'JOV-6688',
      'JOV-6689',
      'JOV-6690',
      'JOV-5934',
    ].map(identifier => [
      identifier,
      {
        identifier,
        labels,
        state: identifier === 'JOV-6688' ? 'Backlog' : 'Done',
        stateType: identifier === 'JOV-6688' ? 'backlog' : 'completed',
        url: `https://linear.app/jovie/issue/${identifier}`,
      },
    ])
  );
}

function fixture({
  status = 'reviewed',
  rowState = 'pending',
  receipt = 'pending',
} = {}) {
  return {
    path: 'docs/postmortems/2026-10-14-fixture.md',
    source: `---
id: 2026-10-14-fixture
status: ${status}
severity: sev2
detected: 2026-10-14T01:00Z
repaired: 2026-10-14T02:00Z
failure_classes: [green-by-implication]
detectable_before_human: true
detection_gaps: [false-green]
replay_corpus: [docs/postmortems/2026-10-14-fixture.md#timeline-utc]
founder_rescues: 1
incident_issue: JOV-9000
actions: [JOV-9001]
gbrain: ops/postmortems/2026-10-14-fixture
---

# Fixture

## Summary
Summary.

## Impact
Impact.

## Timeline (UTC)
Timeline.

## Root cause
Cause.

## Contributing causes
Factors.

## Failure classes and invariants violated
Classes.

## Why detection failed
Detection.

## Instance fix
Fix.

## Systemic controls
1. Control every sibling surface (JOV-9001).

## Action items
| Issue | Control | Class | State | Live verification receipt |
| --- | --- | --- | --- | --- |
| [JOV-9001](https://linear.app/jovie/issue/JOV-9001) | Detector | \`green-by-implication\` | ${rowState} | ${receipt} |

## Open questions and unverified claims
None.
`,
  };
}

test('production-freeze review is template-complete and emits a DetectionGap', () => {
  const review = reviewPostmortem(targetDocument(), actionAudit());
  assert.equal(review.id, '2026-09-26-production-freeze');
  assert.equal(review.detectionGap.complete, true);
  assert.equal(review.detectionGap.detectableBeforeHuman, true);
  assert.deepEqual(review.detectionGap.gapClasses, [
    'false-green',
    'missing-invariant',
    'missing-join',
    'missing-remediator',
    'missing-signal',
  ]);
  assert.equal(review.detectionGap.founderRescues, 1);
  assert.equal(review.controls.length, 6);
  assert.equal(review.actionRows.length, 8);
  assert.equal(
    review.errors.some(error => error.includes('required section')),
    false
  );
});

test('systemic controls and action rows are machine-readable', () => {
  const document = fixture({
    rowState: 'verified',
    receipt: 'https://example.test/live-receipt',
  });
  assert.deepEqual(parseSystemicControls(document.source), [
    {
      index: 1,
      text: 'Control every sibling surface (JOV-9001).',
      issues: ['JOV-9001'],
    },
  ]);
  const rows = parseActionRows(document.source);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].issue, 'JOV-9001');
  assert.equal(isVerifiedActionRow(rows[0]), true);
});

test('closure fails closed without verified live action receipts', () => {
  const review = reviewPostmortem(fixture({ status: 'closed' }), {
    'JOV-9001': {
      identifier: 'JOV-9001',
      labels: ['postmortem-action'],
      state: 'Done',
      stateType: 'completed',
    },
  });
  assert.equal(review.closureEligible, false);
  assert.deepEqual(review.unverifiedActions, ['JOV-9001']);
  assert.match(review.errors.join('\n'), /requires every action row verified/);
});

test('closure accepts a verified injected or live receipt', () => {
  const review = reviewPostmortem(
    fixture({
      status: 'closed',
      rowState: 'verified',
      receipt: 'docs/postmortems/reports/verified.json',
    }),
    {
      'JOV-9001': {
        identifier: 'JOV-9001',
        labels: ['postmortem-action'],
        state: 'Done',
        stateType: 'completed',
      },
    }
  );
  assert.equal(review.closureEligible, true);
  assert.equal(
    review.errors.some(error => error.includes('requires every action row')),
    false
  );
});

test('action audit catches missing postmortem-action labels', () => {
  const review = reviewPostmortem(fixture(), {
    'JOV-9001': {
      identifier: 'JOV-9001',
      labels: ['quality-gap'],
      state: 'Backlog',
      stateType: 'backlog',
    },
  });
  assert.match(review.errors.join('\n'), /lacks postmortem-action label/);
});

test('systemic controls without an issue are selected for Linear intake', () => {
  const document = fixture();
  document.source = document.source.replace(
    'Control every sibling surface (JOV-9001).',
    'Control every sibling surface.'
  );
  const review = reviewPostmortem(document, actionAudit());
  assert.deepEqual(findUnownedSystemicControls([review]), [
    {
      postmortem: '2026-10-14-fixture',
      path: 'docs/postmortems/2026-10-14-fixture.md',
      index: 1,
      text: 'Control every sibling surface.',
      issues: [],
    },
  ]);
});

test('event-driven grouping opens one class action and ranks rescues', () => {
  const base = reviewPostmortem(fixture(), {
    'JOV-9001': {
      identifier: 'JOV-9001',
      labels: ['postmortem-action'],
      state: 'Backlog',
      stateType: 'backlog',
    },
  });
  const second = {
    ...base,
    id: '2026-10-15-fixture',
    path: 'docs/postmortems/2026-10-15-fixture.md',
    detectionGap: { ...base.detectionGap, founderRescues: 2 },
  };
  const groups = groupFailureClasses([base, second], {
    'green-by-implication': {
      issue: 'JOV-9999',
      url: 'https://linear.app/jovie/issue/JOV-9999',
    },
  });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].recurring, true);
  assert.equal(groups[0].count, 2);
  assert.equal(groups[0].founderRescues, 3);
  assert.equal(groups[0].classAction.issue, 'JOV-9999');

  const report = buildReviewReport({
    documents: [fixture(), fixture()],
    issueAudit: {
      'JOV-9001': {
        labels: ['postmortem-action'],
        state: 'Backlog',
        stateType: 'backlog',
      },
    },
    classActionRegistry: {
      'green-by-implication': { issue: 'JOV-9999' },
    },
    generatedAt: new Date('2026-10-14T00:00:00Z'),
  });
  assert.deepEqual(report.summary.recurringWithoutAction, []);
  assert.equal(report.capabilityExpansionRanking[0].feeds, 'JOV-5817');
});

test('repository class-action registry covers every recurring class', () => {
  const documents = readPostmortemDocuments(REPO_ROOT);
  const registry = readClassActionRegistry(REPO_ROOT);
  const report = buildReviewReport({
    documents,
    classActionRegistry: registry,
    generatedAt: new Date('2026-10-14T00:00:00Z'),
  });
  assert.deepEqual(report.summary.recurringWithoutAction, []);
  assert.deepEqual(
    report.failureClasses
      .filter(item => item.recurring)
      .map(item => item.failureClass),
    [
      'green-by-implication',
      'non-convergent-control-loop',
      'pre-merge-parity-gap',
      'silent-production-staleness',
    ]
  );
});

test('GBrain mirror is only complete after digest-bound readback', async () => {
  let storedMarker = '';
  const calls = [];
  const fetchImpl = async (_url, init) => {
    const request = JSON.parse(init.body);
    calls.push(request.params.name);
    if (request.params.name === 'put_page') {
      storedMarker = request.params.arguments.content.match(
        /gbrain-mirror-source-sha256:[0-9a-f]{64}/u
      )?.[0];
    }
    const text =
      request.params.name === 'get_page' && calls.length === 1
        ? '{"error":"not found"}'
        : storedMarker || '{"ok":true}';
    return new Response(
      `event: message\ndata: ${JSON.stringify({ result: { content: [{ type: 'text', text }] } })}\n\n`,
      { headers: { 'content-type': 'text/event-stream' } }
    );
  };
  const result = await mirrorPostmortem(targetDocument(), {
    apiUrl: 'https://gbrain.example',
    apiKey: 'test-token',
    fetchImpl,
  });
  assert.equal(result.status, 'mirrored');
  assert.equal(result.readbackVerified, true);
  assert.deepEqual(calls, ['get_page', 'put_page', 'get_page']);
});

test('GBrain mirror buffers a tool-level write failure', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    const result =
      calls === 1
        ? { content: [{ type: 'text', text: '{"error":"not found"}' }] }
        : {
            isError: true,
            content: [{ type: 'text', text: '{"error":"write failed"}' }],
          };
    return new Response(
      `event: message\ndata: ${JSON.stringify({ result })}\n\n`,
      { headers: { 'content-type': 'text/event-stream' } }
    );
  };
  const result = await mirrorPostmortem(targetDocument(), {
    apiUrl: 'https://gbrain.example',
    apiKey: 'test-token',
    fetchImpl,
  });
  assert.equal(result.status, 'buffered');
  assert.equal(result.reason, 'tool-error');
  assert.equal(calls, 2);
});

test('shipping SLO retains monitoring while only evidence events run post-mortem review', () => {
  const shipping = yamlLoad(
    readFileSync(
      resolve(REPO_ROOT, '.github/workflows/shipping-slo.yml'),
      'utf8'
    )
  );
  assert.deepEqual(shipping.on.schedule, [{ cron: '13 7 * * *' }]);
  const commands = shipping.jobs.measure.steps
    .map(step => step.run ?? '')
    .join('\n');
  assert.match(commands, /shipping-slo-report\.mjs report/);
  assert.match(commands, /shipping-slo-intake\.mjs/);
  assert.doesNotMatch(
    commands,
    /postmortem|quality-gap-finder|lesson-analysis|invariant-stewardship/
  );
  const quality = yamlLoad(
    readFileSync(
      resolve(REPO_ROOT, '.github/workflows/quality-gap-finder.yml'),
      'utf8'
    )
  );
  assert.equal(quality.on.schedule, undefined);
  assert.ok(quality.on.push.paths.includes('docs/postmortems/**'));
  assert.deepEqual(quality.on.repository_dispatch.types, ['quality-gap-scan']);
  assert.match(
    quality.jobs.find.steps.map(step => step.run ?? '').join('\n'),
    /postmortem-review\.mjs/
  );
});

test('scheduled learning commands reject before filesystem scans or network work', () => {
  for (const script of [
    'postmortem-review.mjs',
    'postmortem-review-report.mjs',
    'quality-gap-finder.mjs',
  ]) {
    const result = spawnSync(
      process.execPath,
      [
        resolve(REPO_ROOT, 'scripts', script),
        '--root',
        '/nonexistent-learning-input',
        '--out',
        '/nonexistent-learning-output',
      ],
      {
        encoding: 'utf8',
        timeout: 5000,
        env: { ...process.env, GITHUB_EVENT_NAME: 'schedule' },
      }
    );
    assert.ifError(result.error);
    assert.equal(result.status, 1, script);
    assert.equal(result.stdout, '', script);
    assert.match(result.stderr, /scheduled-learning-retired/, script);
    assert.doesNotMatch(result.stderr, /ENOENT|fetch failed/, script);
  }
  for (const event of [
    'push',
    'repository_dispatch',
    'workflow_dispatch',
    undefined,
  ]) {
    assert.doesNotThrow(() => assertEventDrivenLearning(event));
  }
});
