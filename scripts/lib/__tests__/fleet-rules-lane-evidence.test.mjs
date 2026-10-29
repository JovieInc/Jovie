import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { evaluateFleetRules } from '../../pr-fleet-rules.mjs';
import { evaluateCustomerNoteContract } from '../daily-changelog-publication.mjs';

const { load } = createRequire(import.meta.url)('js-yaml');
const root = resolve(import.meta.dirname, '../../..');

test('the lane relay is woken by PR Fleet Rules so a quota-deferred run is re-run, not left red', () => {
  const workflow = load(
    readFileSync(resolve(root, '.github/workflows/lane-fix-relay.yml'), 'utf8')
  );
  assert.ok(workflow.on.workflow_run.workflows.includes('PR Fleet Rules'));
});

test('the red-before-green block the lanes write satisfies the Fleet Rules parser', () => {
  const body = execFileSync(
    'python3',
    [
      '-c',
      [
        'import sys,json',
        "sys.path.insert(0,'scripts/lanes')",
        'import pr_events as e',
        "pr={'number':7,'headRefOid':'a'*40,'statusCheckRollup':[{'name':'Source Validation','conclusion':'FAILURE','detailsUrl':'https://github.com/JovieInc/Jovie/actions/runs/123/job/456'}]}",
        "print('## Summary\\nx\\n\\n'+e.red_before_green_block(pr,'### Source Validation\\n# stray\\nAssertionError: boom'))",
      ].join('\n'),
    ],
    { cwd: root, encoding: 'utf8' }
  );
  const labels = ['ci-fix'];
  const bare = evaluateFleetRules({
    pr: { title: 'feat(x): y', body: '## Summary\nx', labels },
    files: [],
  });
  assert.ok(bare.errors.some(e => e.startsWith('red-before-green')));
  const withBlock = evaluateFleetRules({
    pr: { title: 'feat(x): y', body, labels },
    files: [],
  });
  assert.equal(
    withBlock.errors.filter(e => e.startsWith('red-before-green')).length,
    0
  );
});

// Execute the lane generator, then pass its output through the production guards.
// This proves metadata compatibility, not model compliance or product runtime.
for (const decision of [
  { releaseWorthy: false },
  {
    issueId: 'JOV-7447',
    outcomeKey: 'profile-link-claim',
    audience: 'public',
    visibility: 'public',
    releaseWorthy: true,
    section: 'Added',
    text: 'Choose your profile link: Start with a name on the homepage.',
    availability: { status: 'ga', prerequisites: [] },
    evidence: [{ url: 'https://jov.ie/', contains: 'Claim' }],
  },
]) {
  test(`repair metadata satisfies both guards with releaseWorthy=${decision.releaseWorthy}`, () => {
    const body = execFileSync(
      'python3',
      [
        '-c',
        [
          'import sys,json',
          "sys.path.insert(0,'scripts/lanes')",
          'import pr_events as e',
          "pr={'statusCheckRollup':[{'name':'Source Validation','conclusion':'FAILURE','detailsUrl':'https://github.com/JovieInc/Jovie/actions/runs/123/job/456'}]}",
          "print(e.repair_evidence_body(pr, '## Summary\\nRepair', customer_decision=json.loads(sys.argv[1])))",
        ].join('\n'),
        JSON.stringify(decision),
      ],
      { cwd: root, encoding: 'utf8' }
    );
    assert.deepEqual(
      evaluateFleetRules({
        pr: { title: 'fix(links): count social visits', body },
        files: [],
      }).errors,
      []
    );
    const verdict = evaluateCustomerNoteContract({
      files: ['apps/web/app/s/[code]/route.ts'],
      body,
      createdAt: '2026-10-28T00:00:00Z',
    });
    assert.equal(verdict.passed, true, verdict.reason);
    assert.equal(body.split('customer-changelog/v1').length - 1, 1);
  });
}
