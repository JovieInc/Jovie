import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  REPO_ROOT,
  STRUCTURAL_ASSERTED_DOC_EXCLUSIONS,
  scanStructuralAssertedDocPaths,
  structuralControlPattern,
} from '../structural-asserted-doc-paths.mjs';

const CI_WORKFLOW = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/ci.yml'),
  'utf8'
);

function structuralUiPattern() {
  const decision = CI_WORKFLOW.slice(
    CI_WORKFLOW.indexOf('- name: Decide structural lane'),
    CI_WORKFLOW.indexOf('- name: Select Storybook browser proof')
  );
  const match = decision.match(/STRUCTURAL_UI_PATTERN='([^']+)'/);
  expect(match, 'STRUCTURAL_UI_PATTERN in Decide structural lane').toBeTruthy();
  return match[1];
}

describe('structural-asserted docs stay selected (JOV-12618)', () => {
  it('selects every tracked markdown path structural suites assert', () => {
    const control = new RegExp(structuralControlPattern());
    const ui = new RegExp(structuralUiPattern());
    const asserted = scanStructuralAssertedDocPaths();
    expect(asserted.map(item => item.path)).toContain('.claude/rules/swarm.md');
    expect(asserted.map(item => item.path)).toContain(
      'docs/COST_MONITORING.md'
    );
    for (const { path, suites } of asserted) {
      const selected = control.test(path) || ui.test(path);
      expect(selected, `${path} (from ${suites.join(', ')})`).toBe(true);
    }
  });

  it('documents intentional exclusions for fixtures and unwired suites', () => {
    expect(STRUCTURAL_ASSERTED_DOC_EXCLUSIONS).toContain(
      'docs/ops/openai-symphony-burrito.md'
    );
    expect(STRUCTURAL_ASSERTED_DOC_EXCLUSIONS).toContain(
      'docs/plans/some-analysis.md'
    );
  });

  it('selects the full .claude/rules tree, including swarm.md', () => {
    const control = new RegExp(structuralControlPattern());
    expect(control.test('.claude/rules/swarm.md')).toBe(true);
    expect(control.test('.claude/rules/auth.md')).toBe(true);
    expect(control.test('.claude/rules/ci-branching.md')).toBe(true);
    expect(control.test('.claude/skills/qa/SKILL.md')).toBe(false);
  });
});
