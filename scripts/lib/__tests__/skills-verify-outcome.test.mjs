import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Every skill that declares something healthy, verified, fixed or shipped
// carries the verify-the-outcome contract (false-green class, JOV-9625).
const repoRoot = resolve(import.meta.dirname, '../../..');
const read = path => readFileSync(resolve(repoRoot, path), 'utf8');

const GSTACK_VERIFIERS = [
  'canary',
  'land-and-deploy',
  'qa-only',
  'ship',
  'investigate',
];

describe('verification skills assert the outcome, not the action', () => {
  it.each(GSTACK_VERIFIERS)(
    '%s renders the shared VERIFY_OUTCOME block',
    skill => {
      const tmpl = read(`.agents/skills/gstack/${skill}/SKILL.md.tmpl`);
      const rendered = read(`.agents/skills/gstack/${skill}/SKILL.md`);
      expect(tmpl).toContain('{{VERIFY_OUTCOME}}');
      expect(rendered).toContain('## Verify the outcome, not the action');
      expect(rendered).toContain('scripts/lib/outcome-verifier.mjs');
    }
  );

  it('land-and-deploy has no skip-to-green path and needs an oracle', () => {
    const rendered = read('.agents/skills/gstack/land-and-deploy/SKILL.md');
    expect(rendered).not.toMatch(/warming up\. Mark it as healthy/);
    expect(rendered).toMatch(/Mark healthy only if the re-run passes/);
    expect(rendered).toMatch(/a 200 error page fails/);
  });

  it('canary alerts on a failure surface at first sighting', () => {
    expect(read('.agents/skills/gstack/canary/SKILL.md')).toMatch(
      /CRITICAL on first sighting/
    );
  });

  it('the in-repo qa skills point at the shared verifier', () => {
    expect(read('.claude/skills/qa/SKILL.md')).toContain('assertOutcome(');
    expect(read('.claude/skills/qa-swarm/SKILL.md')).toContain(
      'detectFailureSurface'
    );
  });
});
