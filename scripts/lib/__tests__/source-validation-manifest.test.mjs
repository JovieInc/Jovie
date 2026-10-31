import { readFileSync } from 'node:fs';
import { load as yamlLoad } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { deriveSteps, WORKFLOW_PATH } from '../../preflight.mjs';
import {
  coveredBy,
  NOT_LOCAL,
  SOURCE_VALIDATION_GUARDS,
  selectManifestGuards,
  workflowCommands,
} from '../source-validation-manifest.mjs';

const read = f =>
  readFileSync(new URL(`../../../${f}`, import.meta.url), 'utf8');
const pkg = JSON.parse(read('package.json'));
const runs = deriveSteps(read(WORKFLOW_PATH))
  .map(s => s.run)
  .filter(Boolean);
const commands = workflowCommands(runs, pkg.scripts, coveredBy);

describe('Source Validation manifest parity', () => {
  it('every command Source Validation runs is a manifest guard or has a NOT_LOCAL reason', () => {
    const missing = commands.filter(c => !coveredBy(c));
    expect(
      missing,
      `add to SOURCE_VALIDATION_GUARDS or NOT_LOCAL in scripts/lib/source-validation-manifest.mjs:\n${missing.join('\n')}`
    ).toEqual([]);
  });

  it('every guard still names a command that its workflow runs (no stale entries)', () => {
    const stale = [];
    for (const g of SOURCE_VALIDATION_GUARDS) {
      const text = g.workflow
        ? JSON.stringify(yamlLoad(read(`.github/workflows/${g.workflow}`)))
        : commands.join('\n') + JSON.stringify(runs);
      for (const c of g.covers)
        if (!text.includes(c)) stale.push(`${g.id}: ${c}`);
    }
    expect(stale).toEqual([]);
  });

  it('NOT_LOCAL entries carry a reason and still match a workflow command', () => {
    for (const n of NOT_LOCAL) expect(n.reason.length).toBeGreaterThan(8);
    const dead = NOT_LOCAL.filter(
      n => !commands.some(c => c.includes(n.match))
    );
    expect(dead.map(n => n.match)).toEqual([]);
  });

  it('selects path-scoped guards, including the ones that failed PR #24021', () => {
    const ids = selectManifestGuards(['.github/workflows/x.yml']).map(
      g => g.id
    );
    for (const id of [
      'wf:topology',
      'wf:control-tests',
      'wf:token-budget',
      'wf:token-scope',
    ])
      expect(ids).toContain(id);
    expect(selectManifestGuards(['README.md'])).toEqual([]);
  });
});
