import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  CI_LANES,
  classifyChangedFile,
  classifyCiRepoLanes,
  main as emitCiRepoLanes,
  FOREIGN_REQUIRED_CHECK_CONTEXTS,
  githubLaneOutputs,
  JOVIE_REQUIRED_CHECK_CONTEXTS,
  jovieRequiredChecksAreLocal,
} from '../ci-repo-lanes.mjs';
import {
  ALLOWED_REQUIRED_CHECK_CONTEXTS,
  parseRequiredStatusChecksFromYaml,
  REQUIRED_MERGE_STATUSES,
} from '../merge-queue-guard.mjs';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');

describe('JOV-5288 CI repo lanes', () => {
  it('keeps Symphony control-plane files off the Jovie product suite', () => {
    const plan = classifyCiRepoLanes([
      'scripts/hermes/gem-priority-gate.py',
      'scripts/hermes/tests/gem-priority-gate.test.py',
      'scripts/backlog-orchestrator/admitter.mjs',
    ]);
    expect(plan.runJovieProduct).toBe(false);
    expect(plan.runSymphonyControl).toBe(true);
    expect(plan.runSummerOps).toBe(false);
    expect(plan.lanes).toEqual([CI_LANES.SYMPHONY_CONTROL]);
  });

  it('classifies ci-fast lane wiring as Symphony control-plane, not Jovie product', () => {
    expect(classifyChangedFile('scripts/ci-fast-lanes.mjs')).toEqual([
      CI_LANES.SYMPHONY_CONTROL,
    ]);
    expect(classifyChangedFile('scripts/lib/ci-repo-lanes.mjs')).toEqual([
      CI_LANES.SYMPHONY_CONTROL,
    ]);
  });

  it('keeps Jovie product files off Symphony and Summer/ops suites', () => {
    const plan = classifyCiRepoLanes([
      'apps/web/components/features/profile/ProfileHeader.tsx',
      'apps/web/tests/unit/profile/ProfileHomeRail.test.tsx',
      'packages/ui/src/button.tsx',
    ]);
    expect(plan.runJovieProduct).toBe(true);
    expect(plan.runSymphonyControl).toBe(false);
    expect(plan.runSummerOps).toBe(false);
  });

  it('keeps Summer/ops canon off Jovie product CI', () => {
    const plan = classifyCiRepoLanes([
      'docs/company/operating-principles.md',
      'STRATEGY.md',
      'canon/FLEET.md',
      'content/investors/note.md',
    ]);
    expect(plan.runJovieProduct).toBe(false);
    expect(plan.runSymphonyControl).toBe(false);
    expect(plan.runSummerOps).toBe(true);
  });

  it('fails closed onto the product lane for unknown non-doc files', () => {
    expect(classifyChangedFile('unknown-root-tool.sh')).toEqual([
      CI_LANES.JOVIE_PRODUCT,
    ]);
    expect(
      classifyCiRepoLanes(['README.md', 'CHANGELOG.md']).runJovieProduct
    ).toBe(false);
    expect(classifyCiRepoLanes([]).runJovieProduct).toBe(false);
  });

  it('runs both product and control-plane suites for shared CI roots', () => {
    const plan = classifyCiRepoLanes([
      '.github/workflows/ci.yml',
      'package.json',
    ]);
    expect(plan.runJovieProduct).toBe(true);
    expect(plan.runSymphonyControl).toBe(true);
  });

  it('emits GitHub outputs that skip product suites for Symphony-only diffs', () => {
    const plan = classifyCiRepoLanes(['scripts/hermes/codex-rotate']);
    expect(githubLaneOutputs(plan)).toEqual([
      'run_jovie_product=false',
      'run_symphony_control=true',
      'run_summer_ops=false',
    ]);
    expect(githubLaneOutputs(plan, { forceAll: true })).toEqual([
      'run_jovie_product=true',
      'run_symphony_control=true',
      'run_summer_ops=true',
    ]);
    expect(githubLaneOutputs(plan, { forceNone: true })).toEqual([
      'run_jovie_product=false',
      'run_symphony_control=false',
      'run_summer_ops=false',
    ]);
  });

  it('pins only this repo’s required-check aggregates', () => {
    const yaml = readFileSync(
      join(REPO_ROOT, '.github/rulesets/branch-protection.yml'),
      'utf8'
    );
    const live = parseRequiredStatusChecksFromYaml(yaml);
    expect(live).toEqual([...JOVIE_REQUIRED_CHECK_CONTEXTS]);
    expect(REQUIRED_MERGE_STATUSES).toEqual([...JOVIE_REQUIRED_CHECK_CONTEXTS]);
    expect(jovieRequiredChecksAreLocal(live).ok).toBe(true);
    expect(
      jovieRequiredChecksAreLocal(ALLOWED_REQUIRED_CHECK_CONTEXTS).ok
    ).toBe(true);
    expect(
      jovieRequiredChecksAreLocal(['PR Ready', 'Symphony CI']).foreign
    ).toEqual(['Symphony CI']);
    expect(
      jovieRequiredChecksAreLocal([
        'JovieInc/summer-config validation',
        'Ops review',
      ]).ok
    ).toBe(false);
    for (const name of FOREIGN_REQUIRED_CHECK_CONTEXTS) {
      expect(live).not.toContain(name);
      expect(ALLOWED_REQUIRED_CHECK_CONTEXTS).not.toContain(name);
    }
  });

  it('writes lane flags onto GITHUB_OUTPUT', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ci-repo-lanes-'));
    const outputPath = join(dir, 'github-output.txt');
    writeFileSync(outputPath, '');
    const previous = process.env.GITHUB_OUTPUT;
    process.env.GITHUB_OUTPUT = outputPath;
    try {
      expect(emitCiRepoLanes(['--emit-github-output', '--none'])).toBe(0);
    } finally {
      if (previous === undefined) delete process.env.GITHUB_OUTPUT;
      else process.env.GITHUB_OUTPUT = previous;
    }
    expect(readFileSync(outputPath, 'utf8')).toBe(
      'run_jovie_product=false\nrun_symphony_control=false\nrun_summer_ops=false\n'
    );
  });
});
