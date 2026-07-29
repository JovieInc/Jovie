import assert from 'node:assert/strict';
import test from 'node:test';

import { auditWorkflowExecution } from './audit-workflow-execution.mjs';

test('warns when a privileged pull_request_target workflow checks out PR head code', () => {
  const audit = auditWorkflowExecution({
    'unsafe.yml': `on:\n  pull_request_target:\njobs:\n  audit:\n    steps:\n      - uses: actions/checkout@deadbeef\n        with:\n          ref: \${{ github.event.pull_request.head.sha }}\n`,
  });

  assert.equal(audit.findings.length, 1);
  assert.equal(audit.findings[0].level, 'warning');
  assert.match(audit.findings[0].message, /untrusted pull request code/);
});

test('accepts a pull_request_target workflow that checks out only trusted base code', () => {
  const audit = auditWorkflowExecution({
    'trusted.yml': `on:\n  pull_request_target:\njobs:\n  audit:\n    steps:\n      - uses: actions/checkout@deadbeef\n        with:\n          ref: \${{ github.event.pull_request.base.sha }}\n`,
  });

  assert.deepEqual(audit.findings, []);
  assert.equal(audit.privilegedWorkflows[0].usesTrustedPullRequestBase, true);
});

test('inventories workflow_run head checkouts without treating trusted release paths as findings', () => {
  const audit = auditWorkflowExecution({
    'release.yml': `on:\n  workflow_run:\njobs:\n  release:\n    steps:\n      - uses: actions/checkout@deadbeef\n        with:\n          ref: \${{ github.event.workflow_run.head_sha }}\n`,
  });

  assert.deepEqual(audit.findings, []);
  assert.deepEqual(audit.privilegedWorkflows[0].workflowRunHeadRefs, [
    '${{ github.event.workflow_run.head_sha }}',
  ]);
});
