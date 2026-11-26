import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  collectDesignAuditFindings,
  DESIGN_AUDIT_RECIPES,
  getRecipe,
  READ_ONLY_CONTRACT,
} from './collect.mjs';
import { proposeDesignAuditFindings } from './propose.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

describe('design-audit-swarm', () => {
  it('exposes five recipes and a read-only contract', () => {
    assert.equal(DESIGN_AUDIT_RECIPES.length, 5);
    assert.equal(READ_ONLY_CONTRACT.mutatesPen, false);
    assert.equal(READ_ONLY_CONTRACT.proposesLinearOnly, true);
    assert.equal(getRecipe('pen-parity').id, 'pen-parity');
  });

  it('collectors avoid pen writer/fixer/emit imports', () => {
    const source = readFileSync(path.join(HERE, 'collect.mjs'), 'utf8');
    assert.equal(
      /from ['"].*pen-review\/(fixer|pen-bridge|writer)/.test(source),
      false
    );
    assert.equal(/from ['"].*design-pen-codegen-emit/.test(source), false);
  });

  it('collect returns findings for media-gen inventory', () => {
    const findings = collectDesignAuditFindings({
      recipeId: 'media-gen-inventory',
    });
    assert.ok(Array.isArray(findings));
    for (const item of findings)
      assert.equal(item.recipeId, 'media-gen-inventory');
  });

  it('dry-run propose skips Linear writes', async () => {
    const summary = await proposeDesignAuditFindings({
      findings: [
        {
          id: 'fixture-1',
          recipeId: 'anti-slop',
          title: 'Fixture',
          summary: 'Dry-run only',
          priority: 'P2',
          kind: 'anti-slop',
          evidencePaths: ['docs/design-system/anti-slop-rules.json'],
        },
      ],
      dryRun: true,
      runId: 'design-audit-test-dry',
      sourceIssue: 'JOV-13850',
    });
    assert.equal(summary.dryRun, true);
    const linear = /** @type {{ identifier?: string }} */ (
      summary.proposed[0].linear
    );
    assert.equal(linear.identifier, 'DRY-RUN');
    assert.equal(summary.contract.mutatesPen, false);
  });
});
