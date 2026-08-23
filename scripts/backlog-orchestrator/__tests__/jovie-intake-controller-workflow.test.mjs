import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const WORKFLOW = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/jovie-intake-controller.yml'),
  'utf8'
);

describe('jovie intake controller workflow contract', () => {
  it('does not globally serialize unrelated issue deliveries', () => {
    assert.match(
      WORKFLOW,
      /group: jovie-intake-\$\{\{ github\.event_name == 'repository_dispatch' && github\.event\.client_payload\.issue_identifier \|\| github\.event_name \}\}/
    );
    assert.doesNotMatch(WORKFLOW, /^ {2}group: jovie-intake-admission$/m);
    assert.match(WORKFLOW, /cancel-in-progress: false/);
  });

  it('keeps one shared host flock around mutating gate-next', () => {
    assert.match(
      WORKFLOW,
      /flock --exclusive "\$lock"\s+\\\s+scripts\/backlog-orchestrator\/run-backlog\.sh gate-next --issue="\$ISSUE_IDENTIFIER"/
    );
    assert.match(
      WORKFLOW,
      /lock="\$GEM_WORKSPACE\/state\/jovie-intake-gate-next\.lock"/
    );
  });

  it('wakes Symphony only after verified admission', () => {
    assert.match(
      WORKFLOW,
      /github\.event_name == 'repository_dispatch' && steps\.admission\.outputs\.admitted == 'true'/
    );
    assert.match(
      WORKFLOW,
      /\.status == "admitted" and\s+any\(\.teams\[\]; \.status == "admitted" and \.issue == \$issue and \.mutations == "verified"\)/
    );
    assert.match(WORKFLOW, /127\.0\.0\.1:4041\/api\/v1\/refresh/);
  });
});
