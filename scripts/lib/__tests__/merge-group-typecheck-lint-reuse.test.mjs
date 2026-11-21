import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  decideTypecheckLintReuse,
  MERGE_GROUP_BASE_SENSITIVE_CI_FAST_LANES,
  parseSkipLaneIds,
  REUSABLE_TYPECHECK_LINT_LANE_IDS,
  reusableLaneDefinitionHash,
  SOURCE_VALIDATION_WORKFLOW_PATH,
  sourceHeadHasGreenValidationProof,
} from '../merge-group-typecheck-lint-reuse.mjs';
import { LANE_GROUPS, selectLanes } from '../../ci-fast-lanes.mjs';

const TREE_A = 'a'.repeat(40);
const TREE_B = 'b'.repeat(40);
const HEAD = 'c'.repeat(40);
const LANE_HASH = reusableLaneDefinitionHash();

describe('merge-group typecheck/lint same-tree reuse (JOV-12618 / JOV-13081)', () => {
  it('red: refuses reuse when merge tree differs from the source PR head tree', () => {
    const decision = decideTypecheckLintReuse({
      mergeTreeSha: TREE_A,
      sourceTreeSha: TREE_B,
      sourceHeadSha: HEAD,
      sourceProofOk: true,
      laneDefinitionHash: LANE_HASH,
      expectedLaneDefinitionHash: LANE_HASH,
    });
    expect(decision.reuse).toBe(false);
    expect(decision.reason).toMatch(/differs/);
    expect(decision.skipLaneIds).toEqual([]);
  });

  it('red: refuses reuse when trees match but the source head has no green proof', () => {
    const decision = decideTypecheckLintReuse({
      mergeTreeSha: TREE_A,
      sourceTreeSha: TREE_A,
      sourceHeadSha: HEAD,
      sourceProofOk: false,
      laneDefinitionHash: LANE_HASH,
      expectedLaneDefinitionHash: LANE_HASH,
    });
    expect(decision.reuse).toBe(false);
    expect(decision.reason).toMatch(/green/);
    expect(decision.skipLaneIds).toEqual([]);
  });

  it('red: refuses reuse when the reusable lane definition hash drifts', () => {
    const decision = decideTypecheckLintReuse({
      mergeTreeSha: TREE_A,
      sourceTreeSha: TREE_A,
      sourceHeadSha: HEAD,
      sourceProofOk: true,
      laneDefinitionHash: createHash('sha256').update('drift').digest('hex'),
      expectedLaneDefinitionHash: LANE_HASH,
    });
    expect(decision.reuse).toBe(false);
    expect(decision.reason).toMatch(/definition hash/);
  });

  it('green: reuses typecheck/lint lanes when same tree + proof + definition match', () => {
    const decision = decideTypecheckLintReuse({
      mergeTreeSha: TREE_A,
      sourceTreeSha: TREE_A,
      sourceHeadSha: HEAD,
      sourceProofOk: true,
      laneDefinitionHash: LANE_HASH,
      expectedLaneDefinitionHash: LANE_HASH,
    });
    expect(decision.reuse).toBe(true);
    expect(decision.skipLaneIds).toEqual([...REUSABLE_TYPECHECK_LINT_LANE_IDS]);
    expect(decision.skipLaneIds).toEqual(
      expect.arrayContaining([
        'typecheck',
        'biome',
        'shadcn-lint-contracts',
        'scripts-typecheck',
      ])
    );
    expect(decision.skipLaneIds).not.toContain('eslint-server-boundaries');
  });

  it('keeps base-sensitive / proof-inequivalent lanes out of the reusable skip set', () => {
    for (const laneId of MERGE_GROUP_BASE_SENSITIVE_CI_FAST_LANES) {
      expect(REUSABLE_TYPECHECK_LINT_LANE_IDS).not.toContain(laneId);
    }
    expect(MERGE_GROUP_BASE_SENSITIVE_CI_FAST_LANES).toEqual(
      expect.arrayContaining([
        'eslint-server-boundaries',
        'design-exception-registry',
        'guardrails',
        'structural',
        'source-guards',
      ])
    );
  });

  it('does not treat eslint-server-boundaries as SV-equivalent (Sentry 20814816)', () => {
    // SV lint:eslint:changed honors inline disables; the MG lane passes
    // --no-inline-config on eslint-server-boundaries.config.js.
    expect(REUSABLE_TYPECHECK_LINT_LANE_IDS).not.toContain(
      'eslint-server-boundaries'
    );
    expect(MERGE_GROUP_BASE_SENSITIVE_CI_FAST_LANES).toContain(
      'eslint-server-boundaries'
    );
  });

  it('proof lookup scopes to source-validation.yml runs (Sentry 20814924)', async () => {
    /** @type {string[]} */
    const urls = [];
    const fetchImpl =
      /** @type {typeof fetch} */
      (async url => {
        urls.push(String(url));
        return /** @type {Response} */ ({
          ok: true,
          async json() {
            return {
              workflow_runs: [{ head_sha: HEAD, conclusion: 'success' }],
            };
          },
        });
      });
    await expect(
      sourceHeadHasGreenValidationProof({
        repository: 'JovieInc/Jovie',
        sourceHeadSha: HEAD,
        token: 't',
        fetchImpl,
      })
    ).resolves.toBe(true);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain(
      `/actions/workflows/${SOURCE_VALIDATION_WORKFLOW_PATH}/runs?`
    );
    expect(urls[0]).not.toMatch(/\/actions\/runs\?/);
    expect(urls[0]).toContain('per_page=100');
    expect(urls[0]).toContain(`head_sha=${HEAD}`);
  });

  it('proof lookup fails open when the workflow-scoped query is empty', async () => {
    const fetchImpl =
      /** @type {typeof fetch} */
      (async () =>
        /** @type {Response} */ ({
          ok: true,
          async json() {
            return { workflow_runs: [] };
          },
        }));
    await expect(
      sourceHeadHasGreenValidationProof({
        repository: 'JovieInc/Jovie',
        sourceHeadSha: HEAD,
        token: 't',
        fetchImpl,
      })
    ).resolves.toBe(false);
  });

  it('parseSkipLaneIds filters ci-fast lanes via CI_FAST_SKIP_LANE_IDS', () => {
    expect([...parseSkipLaneIds('')]).toEqual([]);
    expect([...parseSkipLaneIds(' typecheck , biome ,')].sort()).toEqual([
      'biome',
      'typecheck',
    ]);
    const previous = process.env.CI_FAST_SKIP_LANE_IDS;
    try {
      process.env.CI_FAST_SKIP_LANE_IDS =
        'biome,shadcn-lint-contracts,scripts-typecheck';
      // selectLanes itself does not skip; main() filters with parseSkipLaneIds.
      const remaining = selectLanes('remaining')
        .filter(lane => !parseSkipLaneIds(process.env.CI_FAST_SKIP_LANE_IDS).has(lane.id))
        .map(lane => lane.id);
      expect(remaining).not.toContain('biome');
      expect(remaining).toContain('eslint-server-boundaries');
      expect(remaining).toContain('structural');
    } finally {
      if (previous === undefined) delete process.env.CI_FAST_SKIP_LANE_IDS;
      else process.env.CI_FAST_SKIP_LANE_IDS = previous;
    }
  });

  it('reusable lanes are a subset of the hosted ci-fast lane table', () => {
    const known = new Set(Object.values(LANE_GROUPS).flat());
    for (const laneId of REUSABLE_TYPECHECK_LINT_LANE_IDS) {
      expect(known.has(laneId)).toBe(true);
    }
    expect(LANE_GROUPS.typecheck).toEqual(
      expect.arrayContaining(['typecheck', 'web-tests-typecheck'])
    );
    expect(LANE_GROUPS.remaining).toEqual(
      expect.arrayContaining([
        'biome',
        'eslint-server-boundaries',
        'shadcn-lint-contracts',
        'scripts-typecheck',
        'design-exception-registry',
      ])
    );
  });
});
