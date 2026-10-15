import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../../..');
const CI_TEXT = readFileSync(resolve(ROOT, '.github/workflows/ci.yml'), 'utf8');
const CI = /** @type {{ jobs: Record<string, any> }} */ (load(CI_TEXT));

describe('merge-group red lanes do not rebuild the queue', () => {
  it('posts no early PR Ready failure status', () => {
    expect(CI_TEXT).not.toContain('ejected before the slowest lane');
    expect(
      Object.keys(CI.jobs).filter(job => job.endsWith('-fail-fast'))
    ).toEqual([]);
  });

  it('leaves statuses: write off every ci.yml job', () => {
    const writers = Object.entries(CI.jobs).filter(
      ([, job]) => (job.permissions ?? {}).statuses === 'write'
    );
    expect(writers).toEqual([]);
  });

  it('still fails PR Ready when the merge group is red', () => {
    const ready = CI.jobs['ci-merge-group-ready'];
    expect(ready.if).toBe(
      "${{ always() && github.event_name == 'merge_group' }}"
    );
    expect(ready.name).toContain('PR Ready');
    expect(String(ready.steps[0].run)).toContain('did not pass');
  });
});
