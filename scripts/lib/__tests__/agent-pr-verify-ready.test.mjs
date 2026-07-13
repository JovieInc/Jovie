import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const workflow = readFileSync(
  resolve(repoRoot, '.github/workflows/agent-pr-verify-ready.yml'),
  'utf8'
);

describe('Agent PR Verify Ready live-state guard', () => {
  it('re-reads draft, head, and hold labels before promotion', () => {
    expect(workflow).toContain(
      'gh pr view "$PR_NUMBER" --json isDraft,headRefOid,labels'
    );
    expect(workflow).toContain(
      "HOLD_LABEL_RE='^(needs-human|hold|gated|queue-deferred|fast)$'"
    );
    expect(workflow).toContain('live_head" != "$EXPECTED_HEAD_SHA');
    expect(workflow.indexOf('before="$(read_state)"')).toBeLessThan(
      workflow.indexOf('gh pr ready "$PR_NUMBER"')
    );
  });

  it('compensates a concurrent hold or head change after promotion', () => {
    expect(workflow).toContain('after="$(read_state)"');
    expect(workflow).toContain('held_after');
    expect(workflow).toContain('gh pr ready "$PR_NUMBER" --undo');
    expect(workflow.indexOf('after="$(read_state)"')).toBeGreaterThan(
      workflow.indexOf('gh pr ready "$PR_NUMBER"')
    );
  });
});
