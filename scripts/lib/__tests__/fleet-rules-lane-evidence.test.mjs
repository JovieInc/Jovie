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

test('the lane repairs evidence rejected by Fleet Rules and preserves accepted evidence', () => {
  const section = (command, evidence) =>
    `## Red-before-green\n- Failing command: ${command}\n${evidence}\n`;
  const run =
    '- Failing run (before fix): https://github.com/JovieInc/Jovie/actions/runs/123';
  const cases = [
    ['missing', '## Summary\nDashboard transport repair.'],
    ['valid run', section('`node test.mjs`', run)],
    [
      'valid red output',
      section('`node test.mjs`', '```text\nFAIL transport\n```'),
    ],
    [
      'red output with log heading',
      section(
        '`node test.mjs`',
        '```text\n# failing step\nFAIL transport\n```'
      ),
    ],
    [
      'heading quoted before evidence',
      `\`\`\`text\n## Red-before-green\nplaceholder\n\`\`\`\n${section('`node test.mjs`', run)}`,
    ],
    [
      'placeholder after quoted heading',
      `\`\`\`text\n## Red-before-green\nquoted example\n\`\`\`\n${section('TODO', run)}`,
    ],
    [
      'commented fence before placeholder',
      `<!--\n\`\`\`text\n-->\n${section('TODO', run)}`,
    ],
    [
      'commented fence after placeholder',
      `${section('TODO', run)}<!--\n\`\`\`text\n-->\n`,
    ],
    [
      'inline comment before heading',
      `<!--\nnotes\n-->${section('TODO', run)}`,
    ],
    [
      'invalid host',
      section('`node test.mjs`', run.replace('github.com', 'example.com')),
    ],
    ['invalid run', section('`node test.mjs`', run.replace('/123', '/0'))],
    ['invalid suffix', section('`node test.mjs`', `${run}/job/456`)],
    ['placeholder command', section('`<cmd>`', run)],
    ['placeholder punctuation', section('TODO.', run)],
    ['valid attempt', section('`node test.mjs`', `${run}/attempts/2`)],
    ['invalid attempt', section('`node test.mjs`', `${run}/attempts/0`)],
  ].map(([name, body]) => ({
    name,
    body: `${body}\n## Blast radius\nKeep this proof.\n`,
  }));
  const rows = JSON.parse(
    execFileSync(
      'python3',
      [
        '-c',
        [
          'import sys,json,subprocess',
          'from pathlib import Path',
          "sys.path.insert(0,'scripts/lanes')",
          'import pr_events as e',
          'rows=[]',
          'for case in json.load(sys.stdin):',
          " body=case['body']; edits=[]",
          ' def shell(args):',
          "  if args[:2] == ['pr','view']: return subprocess.CompletedProcess(args,0,body,'')",
          "  assert args[:2] == ['pr','edit'], args",
          "  edits.append(Path(args[args.index('--body-file')+1]).read_text())",
          "  return subprocess.CompletedProcess(args,0,'','')",
          " pr={'number':7,'headRefOid':'a'*40,'statusCheckRollup':[{'name':'Source Validation','conclusion':'FAILURE','detailsUrl':'https://github.com/JovieInc/Jovie/actions/runs/123/job/456'}]}",
          ' complete=e.red_section_complete(body)',
          " e.ensure_red_before_green(pr,'FAIL transport',shell)",
          " rows.append({'complete':complete,'edits':len(edits),'body':edits[0] if edits else body})",
          'print(json.dumps(rows))',
        ].join('\n'),
      ],
      { cwd: root, encoding: 'utf8', input: JSON.stringify(cases) }
    )
  );
  const redErrors = body =>
    evaluateFleetRules({
      pr: { title: 'fix(dashboard): transport repair', body },
      files: [],
    }).errors.filter(error => error.startsWith('red-before-green:'));
  for (const [index, { name, body }] of cases.entries()) {
    const accepted = redErrors(body).length === 0;
    const row = rows[index];
    assert.equal(row.complete, accepted, name);
    assert.equal(row.edits, accepted ? 0 : 1, name);
    assert.deepEqual(redErrors(row.body), [], name);
    assert.ok(row.body.includes('## Blast radius\nKeep this proof.'), name);
    assert.equal(
      row.body.match(/## Red-before-green/g).length,
      body.match(/## Red-before-green/g)?.length ?? 1,
      name
    );
    if (body.startsWith('```text'))
      assert.ok(row.body.startsWith(body.split('```\n')[0] + '```\n'), name);
    if (body.startsWith('<!--'))
      assert.ok(row.body.startsWith(body.split('-->')[0] + '-->'), name);
    if (accepted) assert.equal(row.body, body, name);
  }
});
