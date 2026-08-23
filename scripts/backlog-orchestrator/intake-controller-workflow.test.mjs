import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const workflow = readFileSync(
  resolve('.github/workflows/jovie-intake-controller.yml'),
  'utf8'
);

describe('Summer to Symphony intake workflow', () => {
  it('allows unrelated product work to use independent event capacity', () => {
    assert.match(
      workflow,
      /group: jovie-intake-\$\{\{ github\.event\.client_payload\.issue_identifier \|\| github\.run_id \}\}/
    );
    assert.doesNotMatch(workflow, /group: jovie-intake-admission\s*$/m);
  });

  it('retains one mutating admission writer for lease collision safety', () => {
    assert.match(workflow, /flock --exclusive --wait 120/);
    assert.match(workflow, /jovie-intake-controller\/admission\.lock/);
    assert.match(workflow, /gate-next --issue="\$ISSUE_IDENTIFIER"/);
  });

  it('wakes Symphony only after verified durable admission', () => {
    assert.match(workflow, /steps\.admission\.outputs\.admitted == 'true'/);
    assert.match(workflow, /POST http:\/\/127\.0\.0\.1:4041\/api\/v1\/refresh/);
  });
});
