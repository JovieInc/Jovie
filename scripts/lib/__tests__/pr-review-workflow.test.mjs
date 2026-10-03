import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');

describe('pr-review workflow contract', () => {
  const workflow = readFileSync(
    resolve(REPO_ROOT, '.github/workflows/pr-review.yml'),
    'utf8'
  );

  it('runs trusted main code after PR CI, same-repo only, and ships disabled', () => {
    expect(workflow).toContain(
      'controller-hop-exception: jovie-controller-hop/v1'
    );
    expect(workflow).toContain("vars.PR_REVIEW_ENABLED == 'true'");
    expect(workflow).toContain(
      "github.event.workflow_run.event == 'pull_request'"
    );
    expect(workflow).toContain(
      "github.event.workflow_run.conclusion != 'cancelled'"
    );
    expect(workflow).toContain(
      'github.event.workflow_run.head_repository.full_name == github.repository'
    );
    expect(workflow).toContain('ref: main');
    expect(workflow).toContain('persist-credentials: false');
    expect(workflow).toContain('runs-on: ubuntu-latest');
  });

  it('never gets write access, never posts, never executes PR code', () => {
    expect(workflow).not.toMatch(/:\s*write\b/);
    expect(workflow).toContain('permissions: {}');
    expect(workflow).not.toMatch(
      /pull_request_target|createComment|createReview|gh pr/
    );
    expect(workflow).not.toMatch(
      /ref:\s*\$\{\{\s*github\.event\.workflow_run\.head/
    );
    expect(workflow).not.toContain('pull_requests[0].head');
  });
});
