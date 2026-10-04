import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Queue-proven main pushes skip the CI risk classifier by design, so the
// controller must read the exact SHA's merge-group classification instead of
// falling to `unknown`, which scoped admission (JOV-5939) always blocks.
const workflow = readFileSync(
  resolve(
    __dirname,
    '../../../../../.github/workflows/production-controller.yml'
  ),
  'utf8'
);
const step = workflow.slice(
  workflow.indexOf('- name: Resolve exact CI risk lane'),
  workflow.indexOf('- name: Require fresh exact-main deployment authority')
);

describe('production controller risk lane (JOV-5939 follow-up)', () => {
  it('prefers the triggering run and falls back to the exact-SHA merge-group CI run', () => {
    expect(step).toContain(
      'gh run download "$SOURCE_RUN_ID" --name "$artifact"'
    );
    expect(step).toContain(
      'head_sha=$SOURCE_SHA&event=merge_group&status=success'
    );
    expect(step).toContain('select(.path == ".github/workflows/ci.yml")');
    expect(step).toContain('ci-risk-classification-');
    expect(step).toContain(
      'SOURCE_SHA: ${{ fromJSON(needs.release-source.outputs.ci).head_sha }}'
    );
    const source = readFileSync(
      resolve(
        __dirname,
        '../../../../../.github/scripts/staging-release-source.mjs'
      ),
      'utf8'
    );
    expect(source).toContain("exactRun(ci, repository, CI_PATH, 'push')");
    expect(source).toContain('ci.head_sha === completion.sha');
  });

  it('still fails closed to unknown when no exact classification exists', () => {
    expect(step).toContain('risk_lane=unknown');
    expect(step).toMatch(
      /\^\(low\|medium\|high\)\$ \]\] \|\| risk_lane=unknown/
    );
  });
});
