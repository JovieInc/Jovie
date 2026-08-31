import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { evaluateRepoHygiene } from '../repo-hygiene-guard.mjs';
import {
  CONTROLLER_HOP_EXCEPTION_SCHEMA,
  validateControllerHopChanges,
  validateControllerHopException,
} from './controller-hop-contract.mjs';

const workflowPath = '.github/workflows/new-controller.yml';
const controllerWorkflow = `name: New Controller
on:
  workflow_run:
    workflows: ['CI']
jobs:
  mutate:
    permissions:
      pull-requests: write
    steps:
      - run: gh pr ready "$PR_NUMBER"
`;
const exceptionWorkflow = `# controller-hop-exception: ${CONTROLLER_HOP_EXCEPTION_SCHEMA}
# accountable-writer: Gem
# necessary-trust-boundary: Hosted GitHub App token is the only credential plane that can mutate native PR state while keeping repository code read-only.
# removal-trigger: Remove this workflow when writer-owned promotion can execute the same GitHub App mutation directly from the admitted Symphony runner.
${controllerWorkflow}`;

describe('JOV-INV-022 controller hop contract', () => {
  it('rejects unjustified workflow/controller hops through repo hygiene', () => {
    assert.match(
      validateControllerHopChanges({
        addedPaths: [workflowPath],
        readFile: () => controllerWorkflow,
      }).join('\n'),
      /jovie-controller-hop\/v1/
    );

    const root = mkdtempSync(join(tmpdir(), 'controller-hop-contract-'));
    try {
      mkdirSync(resolve(root, '.github/workflows'), { recursive: true });
      writeFileSync(resolve(root, workflowPath), controllerWorkflow);
      const result = evaluateRepoHygiene({
        addedPaths: [workflowPath],
        changedPaths: [workflowPath],
        root,
        trackedPaths: [workflowPath],
      });
      assert.match(result.errors.join('\n'), /new workflow\/controller hop/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('accepts a documented trust-boundary/capability-gap exception', () => {
    assert.equal(validateControllerHopException(exceptionWorkflow).ok, true);
    assert.deepEqual(
      validateControllerHopChanges({
        addedPaths: [workflowPath],
        readFile: () => exceptionWorkflow,
      }),
      []
    );
  });
});
