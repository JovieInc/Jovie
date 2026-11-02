import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { test } from 'node:test';

const { load } = createRequire(import.meta.url)('js-yaml');
const file = resolve(
  import.meta.dirname,
  '../../../.github/workflows/fleet-rules-evidence.yml'
);
const workflow = load(readFileSync(file, 'utf8'));

// Evaluate the group expression the way Actions would, for two events.
function group(prNumber, headSha) {
  const expr = String(workflow.concurrency.group)
    .replace(/^\$\{\{\s*|\s*\}\}$/g, '')
    .replace(
      /github\.event_name == 'workflow_run' && format\([^)]*\) \|\| /,
      ''
    );
  const format = (fmt, ...args) => fmt.replace(/\{(\d)\}/g, (_, i) => args[i]);
  return new Function(
    'format',
    'github',
    `return ${expr.replace(/github\.event\.pull_request\.number/g, 'github.pr').replace(/github\.event\.pull_request\.head\.sha/g, 'github.sha')};`
  )(format, { pr: prNumber, sha: headSha });
}

test('evidence runs for different heads of one PR never share a concurrency group', () => {
  assert.notEqual(group(23270, '2202898'), group(23270, 'efbef0d'));
  assert.equal(group(23270, 'efbef0d'), group(23270, 'efbef0d'));
  assert.match(String(workflow.concurrency.group), /pull_request\.head\.sha/);
});

test('the re-run job re-runs a cancelled evidence run for the head, capped by attempt', () => {
  const run = workflow.jobs.rerun.steps.map(s => s.run ?? '').join('\n');
  assert.match(run, /"\$concl" = cancelled/);
  assert.match(run, /actions\/runs\/\$ev_id\/rerun"/);
  assert.match(run, /"\$attempt" -lt 3/);
  assert.match(run, /sort_by\(\[\.created_at, \.id\]\)/);
});
