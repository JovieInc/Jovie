import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LANE_COMMANDS,
  LANE_GROUPS,
  selectLanes,
  validateLaneGroups,
} from '../../ci-fast-lanes.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const WORKFLOW = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/ci.yml'),
  'utf8'
);
const PACKAGE_JSON = JSON.parse(
  readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8')
);

const HOSTED_GROUP_JOBS = [
  { jobId: 'ci-fast-typecheck', nextJobId: 'ci-fast-remaining' },
  { jobId: 'ci-fast-remaining', nextJobId: 'ci-fast' },
];

function jobBlock(jobId, nextJobId) {
  const start = WORKFLOW.indexOf(`  ${jobId}:`);
  expect(start, `missing workflow job ${jobId}`).toBeGreaterThanOrEqual(0);
  const end = nextJobId
    ? WORKFLOW.indexOf(`\n  ${nextJobId}:`, start)
    : WORKFLOW.length;
  if (nextJobId) {
    expect(end, `missing workflow job boundary ${nextJobId}`).toBeGreaterThan(
      start
    );
  }
  return WORKFLOW.slice(start, end);
}

describe('ci-fast bounded parallel workflow', () => {
  it('covers every lane exactly once across the explicit hosted groups', () => {
    const laneIds = Object.values(LANE_GROUPS).flat();

    expect(new Set(laneIds).size).toBe(laneIds.length);
    expect([...laneIds].sort()).toEqual([
      'biome',
      'brand-system',
      'eslint-server-boundaries',
      'guardrails',
      'ios-fast',
      'scripts-typecheck',
      'structural',
      'typecheck',
    ]);
    expect(validateLaneGroups(LANE_GROUPS)).toBe(true);
    expect(() =>
      validateLaneGroups({ typecheck: ['typecheck'], remaining: ['typecheck'] })
    ).toThrow(/duplicated/);
    expect(() =>
      validateLaneGroups({ typecheck: ['typecheck'], remaining: ['biome'] })
    ).toThrow(/missing/);
    expect(() =>
      validateLaneGroups({ typecheck: ['unknown'], remaining: [] })
    ).toThrow(/unknown/);
  });

  it('maps the exact hosted selector set to dedicated parallel jobs', () => {
    const hostedSelectors = HOSTED_GROUP_JOBS.map(({ jobId, nextJobId }) => {
      const block = jobBlock(jobId, nextJobId);
      const selector = block.match(/CI_FAST_LANE_GROUP:\s*([^\s]+)/)?.[1];
      expect(selector, `missing hosted selector in ${jobId}`).toBeDefined();
      expect(block).toContain(`name: ci-fast (${selector})`);
      expect(block).toMatch(
        /needs: \[ci-lockfile-preflight, ci-path-changes, ci-merge-group-admission\]/
      );
      expect(block).toMatch(/if: >-\s+!cancelled\(\) &&/);
      expect(block).not.toContain('always()');
      expect(block).toMatch(/needs\.ci-path-changes\.result == 'success'/);
      expect(block).toMatch(/github\.event_name != 'merge_group'/);
      expect(block).toMatch(
        /needs\.ci-merge-group-admission\.result == 'success'/
      );
      return selector;
    });

    expect(new Set(hostedSelectors).size).toBe(hostedSelectors.length);
    expect([...hostedSelectors].sort()).toEqual(
      [...Object.keys(LANE_GROUPS)].sort()
    );
  });

  it('fails closed for invalid selections while preserving local all-lanes default', () => {
    expect(selectLanes().map(lane => lane.id)).toEqual([
      'biome',
      'eslint-server-boundaries',
      'typecheck',
      'scripts-typecheck',
      'brand-system',
      'guardrails',
      'ios-fast',
      'structural',
    ]);
    expect(selectLanes('typecheck').map(lane => lane.id)).toEqual([
      'typecheck',
    ]);
    expect(selectLanes('remaining').map(lane => lane.id)).toEqual(
      LANE_GROUPS.remaining
    );
    expect(() => selectLanes('')).toThrow(/non-empty/);
    expect(() => selectLanes('missing')).toThrow(/Unknown/);
  });

  it('locks the existing lane command manifest', () => {
    expect(LANE_COMMANDS).toEqual({
      biome: 'pnpm run biome:check',
      'eslint-server-boundaries':
        'pnpm --filter=@jovie/web run lint:server-boundaries',
      typecheck: 'pnpm run typecheck',
      'scripts-typecheck': 'pnpm run typecheck:scripts',
      'brand-system': 'pnpm run brand-system:check',
      guardrails: 'pnpm next:proxy-guard',
      'ios-fast': 'pnpm run ios:lint',
      structural:
        'pnpm ci:harness:check && pnpm ci:control:test && pnpm ci:merge-queue:check && pnpm next:proxy-guard && pnpm tailwind:check && pnpm --filter=@jovie/web run lint:no-native-dialogs && pnpm --filter=@jovie/web run lint:seo && pnpm --filter=@jovie/web run lint:contrast-ratchet && pnpm component-ship-gate && pnpm doc:freshness:check && pnpm test:reliability-detectors',
    });
  });

  it('runs the lockfile specifier preflight before expensive fast lanes', () => {
    const preflight = jobBlock('ci-lockfile-preflight', 'ci-path-changes');
    expect(preflight).toContain('name: Lockfile Specifier Preflight');
    expect(preflight).toContain(
      'run: pnpm exec node scripts/lockfile-specifier-preflight.mjs'
    );
    for (const jobId of ['ci-fast-typecheck', 'ci-fast-remaining']) {
      expect(
        jobBlock(
          jobId,
          jobId === 'ci-fast-typecheck' ? 'ci-fast-remaining' : 'ci-fast'
        )
      ).toMatch(
        /needs: \[ci-lockfile-preflight, ci-path-changes, ci-merge-group-admission\]/
      );
    }
  });

  it('keeps workflow contracts in the bounded CI control suite', () => {
    const controlTest = PACKAGE_JSON.scripts['ci:control:test'];

    expect(controlTest).toContain(
      'lib/__tests__/ci-fast-workflow-contract.test.mjs'
    );
    expect(controlTest).toContain(
      'lib/__tests__/merge-group-workflow-contract.test.mjs'
    );
  });

  it('always materializes ci-fast-lanes.json even when setup fails (JOV-4446)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ci-fast-lanes-'));
    const outPath = join(dir, 'ci-fast-lanes.json');
    try {
      const result = spawnSync(
        process.execPath,
        [resolve(REPO_ROOT, 'scripts/ci-fast-lanes.mjs')],
        {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          env: {
            ...process.env,
            CI_FAST_LANE_GROUP: 'not-a-real-group',
            CI_FAST_LANES_OUT: outPath,
          },
        }
      );
      expect(result.status).not.toBe(0);
      const payload = JSON.parse(readFileSync(outPath, 'utf8'));
      expect(payload.schemaVersion).toBe(1);
      expect(payload.job).toBe('ci-fast');
      expect(payload.group).toBe('not-a-real-group');
      expect(payload.lanes).toEqual([]);
      expect(String(payload.setupError)).toMatch(/Unknown CI_FAST_LANE_GROUP/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('uploads ci-fast lane artifacts with warn-not-error missing policy (JOV-4446)', () => {
    for (const { jobId, nextJobId } of HOSTED_GROUP_JOBS) {
      const block = jobBlock(jobId, nextJobId);
      expect(block).toContain(
        'CI_FAST_LANES_OUT: ${{ runner.temp }}/ci-fast-lanes.json'
      );
      expect(block).toContain('path: ${{ runner.temp }}/ci-fast-lanes.json');
      expect(block).toContain('if-no-files-found: warn');
      expect(block).toMatch(
        /github\.event_name == 'merge_group' && github\.event\.merge_group\.base_sha/
      );
    }
  });

  it('keeps structural setup out of typecheck and fails closed in the aggregate', () => {
    const typecheck = jobBlock('ci-fast-typecheck', 'ci-fast-remaining');
    const remaining = jobBlock('ci-fast-remaining', 'ci-fast');
    const aggregate = jobBlock('ci-fast', 'ci-promptfoo-evals');

    expect(typecheck).not.toMatch(
      /rhysd\/actionlint|actions\/setup-python|python -m pip install/
    );
    expect(remaining).toMatch(/rhysd\/actionlint/);
    expect(remaining).toMatch(/actions\/setup-python/);
    expect(remaining).toMatch(/python -m pip install/);
    expect(typecheck).not.toContain('ci-fast-remaining');
    expect(remaining).not.toContain('ci-fast-typecheck');

    expect(aggregate).toMatch(
      /needs:\s*\[\s*ci-path-changes,\s*ci-merge-group-admission,\s*ci-fast-typecheck,\s*ci-fast-remaining,\s*\]/s
    );
    expect(aggregate).toMatch(/^  ci-fast:\n    name: ci-fast$/m);
    expect(aggregate).toMatch(/if: >-\s+always\(\)/);
    expect(aggregate).toMatch(/needs\.ci-path-changes\.result == 'success'/);
    expect(aggregate).toMatch(/github\.event_name != 'merge_group'/);
    expect(aggregate).toMatch(
      /needs\.ci-merge-group-admission\.result == 'success'/
    );
    expect(aggregate).toMatch(
      /TYPECHECK_RESULT: \$\{\{ needs\.ci-fast-typecheck\.result \}\}/
    );
    expect(aggregate).toMatch(
      /REMAINING_RESULT: \$\{\{ needs\.ci-fast-remaining\.result \}\}/
    );
    expect(aggregate).toMatch(
      /\[\[ "\$TYPECHECK_RESULT" != "success" \|\| "\$REMAINING_RESULT" != "success" \]\]/
    );
    expect(aggregate).not.toContain('GROUP_RESULT');
    expect(aggregate).toMatch(/exit 1/);
  });

  it('path-selects both workflow contracts and excludes unrelated tests', () => {
    const remaining = jobBlock('ci-fast-remaining', 'ci-fast');
    const selectorPattern = remaining.match(
      /git diff --name-only[^\n]*\|\s*grep -qE '([^']+)'/
    )?.[1];
    expect(selectorPattern).toBeDefined();

    const selectsStructural = new RegExp(selectorPattern);
    expect(
      selectsStructural.test(
        'scripts/lib/__tests__/ci-fast-workflow-contract.test.mjs'
      )
    ).toBe(true);
    expect(
      selectsStructural.test(
        'scripts/lib/__tests__/merge-group-workflow-contract.test.mjs'
      )
    ).toBe(true);
    expect(
      selectsStructural.test('scripts/lib/__tests__/merge-queue-guard.test.mjs')
    ).toBe(false);
  });

  it('skips the aggregate when the original ci-fast eligibility is skipped', () => {
    const aggregate = jobBlock('ci-fast', 'ci-promptfoo-evals');
    const isEligible = ({ pathResult, eventName, admissionResult }) =>
      pathResult === 'success' &&
      (eventName !== 'merge_group' || admissionResult === 'success');
    const aggregateResult = ({
      pathResult,
      eventName,
      admissionResult,
      groupResult,
    }) =>
      !isEligible({ pathResult, eventName, admissionResult })
        ? 'skipped'
        : groupResult === 'success'
          ? 'success'
          : 'failure';

    expect(
      aggregateResult({
        pathResult: 'skipped',
        eventName: 'push',
        admissionResult: 'skipped',
        groupResult: 'skipped',
      })
    ).toBe('skipped');
    expect(
      aggregateResult({
        pathResult: 'success',
        eventName: 'merge_group',
        admissionResult: 'failure',
        groupResult: 'skipped',
      })
    ).toBe('skipped');
    expect(
      aggregateResult({
        pathResult: 'success',
        eventName: 'merge_group',
        admissionResult: 'success',
        groupResult: 'failure',
      })
    ).toBe('failure');
    expect(aggregate).not.toMatch(
      /needs\.ci-fast-typecheck\.result == 'success'/
    );
    expect(aggregate).not.toMatch(
      /needs\.ci-fast-remaining\.result == 'success'/
    );
  });

  it('keeps downstream requirements on the ci-fast job id', () => {
    const releaseReady = jobBlock('main-release-ready');

    expect(releaseReady).toMatch(/\n\s+ci-fast,/);
    expect(releaseReady).toMatch(
      /FAST_RESULT="\$\{\{ needs\.ci-fast\.result \}\}"/
    );
    expect(WORKFLOW).toContain('name: ci-fast');
  });
});
