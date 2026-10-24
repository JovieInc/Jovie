import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GUARDRAIL_OPERATIONS_TESTS,
  guardrailsMode,
} from '../../ci-fast-lanes.mjs';
import {
  CI_LANES,
  classifyChangedFile,
  classifyCiRepoLanes,
  GUARDRAIL_INPUT_DIR_PREFIXES,
  GUARDRAIL_INPUT_FILES,
  isGuardrailInput,
} from '../ci-repo-lanes.mjs';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');

// Other Guardrails commands (see runGuardrails) and the guard modules the
// operations tests exercise against the real checkout.
const EXTRA_SCANNED_SOURCES = [
  'scripts/dev-loop-latency.test.mjs',
  'scripts/local-runtime-retention.test.mjs',
  'scripts/generated-artifact-retention.test.mjs',
  'scripts/cleanup-safety.test.mjs',
  'scripts/setup-cache-cleanup.test.mjs',
  'scripts/design-authority-guard.mjs',
  'scripts/skill-governance-guard.mjs',
  'scripts/skill-catalog.mjs',
  'scripts/ios-guardrail-rollout-audit.mjs',
  'scripts/dev-loop-latency.mjs',
];

// Literals that name a real repo file only as temp-dir fixture content, so
// editing the real file cannot change a guardrail verdict. Add a reason.
const FIXTURE_ONLY_LITERALS = {
  'README.md': 'written into temp git repos and fixtures, never read from root',
};

function planFor(files) {
  return classifyCiRepoLanes(files);
}

describe('guardrail input selection', () => {
  it('runs guardrails for a CLAUDE.md-only diff without waking the product lane', () => {
    const plan = planFor(['CLAUDE.md']);
    expect(plan.runJovieProduct).toBe(false);
    expect(plan.runGuardrailInputs).toBe(true);
    expect(guardrailsMode({ lanes: plan })).toBe('inputs');
  });

  it('runs guardrails for the rule and skill docs the checks read', () => {
    for (const file of [
      '.claude/rules/gstack.md',
      '.claude/rules/testing.md',
      '.agents/skills/gstack/SKILL.md',
      '.claude/skills/RESOLVER.md',
      'docs/agent-context/vercel-agent-skills-coverage.md',
    ]) {
      const plan = planFor([file]);
      expect(plan.runJovieProduct, file).toBe(false);
      expect(guardrailsMode({ lanes: plan }), file).toBe('inputs');
    }
  });

  it('runs guardrails for non-markdown files under the input trees', () => {
    for (const file of [
      '.claude/skills/foo/config.json',
      '.agents/skills/foo/lock.yaml',
      'docs/agent-context/data.json',
    ]) {
      const plan = planFor([file]);
      // Non-doc files fail closed onto the product lane (full) or, if a
      // future rule routes them elsewhere, still select inputs mode.
      expect(['full', 'inputs'], file).toContain(
        guardrailsMode({ lanes: plan })
      );
      expect(plan.runGuardrailInputs, file).toBe(true);
    }
  });

  it('still skips guardrails for unrelated docs', () => {
    const plan = planFor(['docs/foo.md']);
    expect(plan.runGuardrailInputs).toBe(false);
    expect(guardrailsMode({ lanes: plan })).toBe('skip');
  });

  it('keeps Symphony-only diffs exclusive (JOV-5288)', () => {
    for (const file of [
      'scripts/fleet-gate/gem-priority-gate.py',
      'scripts/lib/ci-repo-lanes.mjs',
      '.claude/rules/ci-branching.md',
    ]) {
      const plan = planFor([file]);
      expect(plan.runJovieProduct, file).toBe(false);
      expect(guardrailsMode({ lanes: plan }), file).toBe('skip');
    }
  });

  it('runs fully for product diffs and manual dispatch', () => {
    expect(guardrailsMode({ lanes: planFor(['apps/web/app/page.tsx']) })).toBe(
      'full'
    );
    expect(
      guardrailsMode({
        event: 'workflow_dispatch',
        lanes: planFor(['docs/foo.md']),
      })
    ).toBe('full');
  });

  it('does not reclassify inputs into the product lane', () => {
    for (const file of ['CLAUDE.md', '.claude/rules/gstack.md']) {
      expect(classifyChangedFile(file)).not.toContain(CI_LANES.JOVIE_PRODUCT);
    }
    expect(isGuardrailInput('./CLAUDE.md')).toBe(true);
    expect(isGuardrailInput('.claude/skills/x/notes.png')).toBe(true);
    expect(isGuardrailInput('docs/foo.md')).toBe(false);
  });

  it('exposes every listed input as an existing file', () => {
    for (const file of GUARDRAIL_INPUT_FILES) {
      expect(existsSync(join(REPO_ROOT, file)), file).toBe(true);
    }
    expect(GUARDRAIL_INPUT_DIR_PREFIXES.length).toBeGreaterThan(0);
  });
});

// LIMITATION: this is a static scan of string-literal paths only. It does not
// follow paths built at runtime (join(root, dir, name), loops over variables)
// or files read by helpers imported from other modules. Coverage is "all
// literal inputs of the scanned sources", not "complete".
describe('guardrail input list covers literal inputs', () => {
  it('lists every literal non-product repo file a guardrail test or guard reads', () => {
    const sources = [...GUARDRAIL_OPERATIONS_TESTS, ...EXTRA_SCANNED_SOURCES];
    const missing = [];
    for (const source of sources) {
      const text = readFileSync(join(REPO_ROOT, source), 'utf8');
      for (const match of text.matchAll(/['"`]([\w./-]+)['"`]/g)) {
        const literal = match[1].replace(/^\.\//, '');
        if (!/[./]/.test(literal) || literal.startsWith('node:')) continue;
        const absolute = join(REPO_ROOT, literal);
        if (literal.endsWith('/') || !existsSync(absolute)) continue;
        if (classifyChangedFile(literal).includes(CI_LANES.JOVIE_PRODUCT)) {
          continue;
        }
        if (isGuardrailInput(literal) || literal in FIXTURE_ONLY_LITERALS) {
          continue;
        }
        missing.push(`${literal} (read in ${source})`);
      }
    }
    expect(
      [...new Set(missing)],
      'add these to GUARDRAIL_INPUT_FILES / GUARDRAIL_INPUT_DIR_PREFIXES in scripts/lib/ci-repo-lanes.mjs, or to FIXTURE_ONLY_LITERALS with a reason'
    ).toEqual([]);
  });
});
