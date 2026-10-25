// Guard (JOV-7998 secrets audit): `pull_request` runs the PR merge ref, and
// same-repository PRs (agents, Apps, collaborators) receive secrets. Any
// workflow that triggers on pull_request and references a secret other than
// GITHUB_TOKEN must be listed here with the reason it is safe, so a new one
// needs a deliberate review. Fixed findings are pinned individually below.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dir = new URL('../../../.github/workflows/', import.meta.url);
const read = name => readFileSync(new URL(name, dir), 'utf8');

const REVIEWED = {
  'codeowners-drift.yml': 'secret step is guarded to push on main',
  'design-gate.yml': 'checker runs from the base commit (.trusted-base)',
  'fork-pr-gate.yml': 'pull_request_target jobs run base code only',
  'linear-sync-on-merge.yml': 'checks out the default branch',
  'neon-ephemeral-branch-cleanup.yml': 'checks out the default branch',
  'source-validation.yml': 'secret steps run before PR-head code',
  'summer-eve-pin.yml': 'token withheld on pull_request',
  'vercel-preview-cleanup.yml': 'checks out the default branch',
};

describe('pull_request workflows that reference secrets', () => {
  it('are all reviewed', () => {
    const found = readdirSync(dir)
      .filter(f => f.endsWith('.yml'))
      .filter(f => {
        const text = read(f);
        const onBlock = text.split(/\njobs:/)[0];
        return (
          /^ {2}pull_request:/m.test(onBlock) &&
          /secrets\.(?!GITHUB_TOKEN)[A-Z_]+/.test(text)
        );
      })
      .sort();
    const unreviewed = found.filter(f => !(f in REVIEWED));
    expect(unreviewed).toEqual([]);
  });

  it('closed-PR cleanup jobs run default-branch scripts', () => {
    for (const f of [
      'vercel-preview-cleanup.yml',
      'neon-ephemeral-branch-cleanup.yml',
    ]) {
      expect(read(f)).toMatch(
        /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/
      );
    }
  });

  it('design gate runs the checker from the base commit', () => {
    const text = read('design-gate.yml');
    expect(text).toMatch(/path: \.trusted-base/);
    expect(text).toMatch(
      /python3 \.trusted-base\/scripts\/lanes\/design_gate_check\.py/
    );
    expect(
      /\n\s+python3 scripts\/lanes\/design_gate_check\.py/.test(text)
    ).toBe(false);
  });

  it('summer identity check withholds its token on pull_request', () => {
    expect(read('summer-eve-pin.yml')).toMatch(
      /github\.event_name != 'pull_request' && secrets\.SUMMER_PIN_CHECK_VERCEL_TOKEN \|\| ''/
    );
  });
});
