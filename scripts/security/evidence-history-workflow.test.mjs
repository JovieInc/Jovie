import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('Security Evidence prepares full selected history before unchanged scanning', () => {
  const workflow = readFileSync(
    '.github/workflows/source-validation.yml',
    'utf8'
  );
  const job = workflow
    .split('    name: Security Evidence')[1]
    .split('\n  migration:')[0];
  assert.match(job, /fetch-depth: 1/);
  assert.doesNotMatch(job, /filter:|fetch-depth: 0/);
  assert.match(
    job,
    /prepare-evidence-history\.sh "\$SECURITY_SOURCE_SHA" "\$SECURITY_BASE_REF"[\s\S]*git merge-base "origin\/\$\{\{ github\.base_ref \}\}" HEAD[\s\S]*scan-secrets\.sh ci-pr/
  );
  assert.match(job, /verify-gitleaks-coverage\.sh/);
  assert.match(job, /dependency-review-action@/);
});
