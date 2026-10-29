import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { evaluateFleetRules } from '../../pr-fleet-rules.mjs';

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

test('lane evidence repairs incomplete sections and preserves fenced examples and complete evidence', () => {
  const run = 'https://github.com/JovieInc/Jovie/actions/runs/123';
  const fixtures = [
    '## Summary\nA repair without evidence',
    `## Red-before-green\n- Failing command: node --test\n- Failing run (before fix): https://github.com/JovieInc/Jovie/pull/123`,
    `## Red-before-green\n- Failing command: node --test\n- Failing run (before fix): ${run}garbage`,
    `## Red-before-green\n- Failing command: <cmd>\n- Failing run (before fix): ${run}`,
    `## Red-before-green\n- Failing command: Not applicable.\n- Failing run (before fix): ${run}`,
    `## Red-before-green\n- Failing command: node --test\n- Failing run (before fix): ${run}`,
    `## Red-before-green\n- Failing command: node --test\n- Failing run (before fix): \`${run}/attempts/2\``,
    '## Red-before-green\nFailing command: node --test\n```text\nFAIL expected green\n```',
    '## Red-before-green\nFailing command: node --test\n```text\n# runner comment\nFAIL expected green\n```\n\n## Next\nKeep this section',
    `## Example\n\`\`\`markdown\n## Red-before-green\nFailing command: node --test\nFailing run (before fix): ${run}\n\`\`\`\n\n## Summary\nKeep this example`,
    '## Red-before-green\nFailing command: TODO\n```text\n# runner comment\nFAIL expected green\n```\n\n## Next\nKeep this section',
    `## Red-before-green\n<!--\nFailing command: node --test\nFailing run (before fix): ${run}\n-->## Next\nKeep this section`,
    '<!--\nKeep author metadata\n-->## Red-before-green\nFailing command: TODO\n\n## Next\nKeep this section',
  ];
  const results = JSON.parse(
    execFileSync(
      'python3',
      [
        '-c',
        `
import json,sys
from pathlib import Path
from types import SimpleNamespace
sys.path.insert(0,'scripts/lanes')
import pr_events as e
pr={'number':7,'headRefOid':'a'*40,'statusCheckRollup':[{'name':'Fleet Rules Evidence','conclusion':'FAILURE','detailsUrl':'${run}/job/456'}]}
results=[]
for body in json.load(sys.stdin):
    def shell(args):
        global body
        if args[:2] == ['pr','edit']:
            body=Path(args[args.index('--body-file')+1]).read_text()
        return SimpleNamespace(returncode=0,stdout=body)
    changed=e.ensure_red_before_green(pr,sh=shell)
    repeated=e.ensure_red_before_green(pr,sh=shell)
    results.append({'body':body,'changed':changed,'repeated':repeated})
print(json.dumps(results))
`,
      ],
      { cwd: root, encoding: 'utf8', input: JSON.stringify(fixtures) }
    )
  );
  const errors = body =>
    evaluateFleetRules({
      pr: { title: 'fix(ai): retry transient health probes', body, labels: [] },
      files: [],
    }).errors;
  for (const [index, result] of results.entries()) {
    assert.equal(
      result.changed,
      errors(fixtures[index]).length > 0,
      fixtures[index]
    );
    assert.deepEqual(errors(result.body), [], result.body);
    assert.equal(
      result.repeated,
      false,
      'a second pass must preserve complete evidence'
    );
    if (!result.changed) assert.equal(result.body, fixtures[index]);
    if (fixtures[index].startsWith('## Example')) {
      assert.ok(
        result.body.startsWith(fixtures[index]),
        'keep the fenced example intact'
      );
    }
    if (fixtures[index].startsWith('<!--')) {
      assert.ok(result.body.startsWith('<!--\nKeep author metadata\n-->'));
    }
    if (fixtures[index].includes('## Next')) {
      assert.ok(
        result.body.endsWith('## Next\nKeep this section'),
        'keep the following section intact'
      );
    }
  }
});
