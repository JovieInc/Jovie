import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
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
const CI_FAST_SOURCE = readFileSync(
  resolve(REPO_ROOT, 'scripts/ci-fast-lanes.mjs'),
  'utf8'
);
const PACKAGE_JSON = JSON.parse(
  readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8')
);

const HOSTED_GROUP_JOBS = [
  { jobId: 'ci-fast-typecheck', nextJobId: 'ci-fast-remaining' },
  {
    jobId: 'ci-fast-remaining',
    nextJobId: 'ci-profile-admission-browser',
  },
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
      'design-conformance',
      'design-exception-registry',
      'design-system-source-ratchet',
      'eslint-server-boundaries',
      'guardrails',
      'ios-fast',
      'profile-admission',
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

  it('skips forced typecheck on source PRs with no TypeScript graph files', () => {
    expect(CI_FAST_SOURCE).toContain('No TypeScript graph files changed');
    expect(CI_FAST_SOURCE).toContain('pnpm turbo typecheck --affected --force');
    expect(CI_FAST_SOURCE).toContain('affectsJovieTypecheck');
    expect(CI_FAST_SOURCE).toContain(
      'files.some(file => affectsJovieTypecheck(file))'
    );
  });

  it('preselects source-PR typecheck before dependency hydration', () => {
    const typecheck = jobBlock('ci-fast-typecheck', 'ci-fast-remaining');

    expect(typecheck).toContain('filter: blob:none');
    expect(typecheck).toMatch(
      /uses: \.\/\.github\/actions\/setup-node-pnpm\n\s+if: >-\n\s+github\.event_name != 'pull_request' \|\|\n\s+needs\.ci-path-changes\.outputs\.run_jovie_typecheck == 'true'/
    );
    expect(typecheck).toContain(
      'CI_FAST_RUN_JOVIE_TYPECHECK: ${{ needs.ci-path-changes.outputs.run_jovie_typecheck }}'
    );
    // The lane runner remains unconditional so the required job still emits a
    // lane receipt; it consumes the same path receipt that controls hydration.
    expect(typecheck).toMatch(
      /- name: Run ci-fast lanes\n\s+id: lanes\n(?!\s+if:)/
    );
    expect(typecheck).not.toContain('CI_FAST_PRESELECTED_SKIP');
    expect(typecheck).toMatch(
      /name: Validate CI\/release incident prevention contract[\s\S]*?run: node scripts\/ci-release-incident-contract\.mjs/
    );
  });

  it('uses the path preselection receipt when hydration is intentionally skipped', () => {
    const repo = mkdtempSync(join(tmpdir(), 'ci-fast-no-typecheck-'));
    const outPath = join(repo, 'ci-fast-lanes.json');
    try {
      const result = spawnSync(
        process.execPath,
        [resolve(REPO_ROOT, 'scripts/ci-fast-lanes.mjs')],
        {
          cwd: repo,
          encoding: 'utf8',
          env: {
            ...process.env,
            CI_FAST_LANE_GROUP: 'typecheck',
            CI_FAST_LANES_OUT: outPath,
            CI_FAST_RUN_JOVIE_TYPECHECK: 'false',
            CI_FAST_ONLY_STRUCTURAL: 'false',
            GITHUB_EVENT_NAME: 'pull_request',
            GITHUB_BASE_REF: 'main',
            TURBO_SCM_BASE: 'origin/main',
            PATH: repo,
          },
        }
      );

      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      const payload = JSON.parse(readFileSync(outPath, 'utf8'));
      expect(payload.lanes).toEqual([
        expect.objectContaining({ id: 'typecheck', status: 'skipped' }),
      ]);
      expect(payload.lanes[0].logExcerpt).toContain(
        'ci-path-changes preselection'
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it.each([
    {
      name: 'a product-owned root script changes',
      relativePath: 'scripts/product-tool.mjs',
    },
    {
      name: 'the scripts baseline changes',
      relativePath: 'scripts/typecheck-baseline.json',
    },
    {
      name: 'an imported script outside the project root changes',
      relativePath: '.github/scripts/product-tool.mjs',
    },
  ])('runs scripts typecheck when $name', ({ relativePath }) => {
    const repo = mkdtempSync(join(tmpdir(), 'ci-fast-product-script-'));
    const binDir = join(repo, 'bin');
    const outPath = join(repo, 'ci-fast-lanes.json');
    const changedPath = join(repo, relativePath);
    const runGit = args =>
      spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
    try {
      mkdirSync(binDir, { recursive: true });
      mkdirSync(dirname(changedPath), { recursive: true });
      // Let unrelated lanes no-op while failing if the scripts lane dispatches
      // anything except the repository's exact typecheck command.
      writeFileSync(
        join(binDir, 'pnpm'),
        [
          '#!/bin/sh',
          'case "$*" in',
          '  "run typecheck:scripts") ;;',
          '  *typecheck:scripts*) exit 41 ;;',
          'esac',
          'printf "%s\\n" "$*"',
          '',
        ].join('\n')
      );
      chmodSync(join(binDir, 'pnpm'), 0o755);
      writeFileSync(changedPath, 'export const value = 1;\n');
      expect(runGit(['init', '--initial-branch=main']).status).toBe(0);
      expect(
        runGit(['config', 'user.email', 'ci-contract@jov.ie']).status
      ).toBe(0);
      expect(runGit(['config', 'user.name', 'CI Contract']).status).toBe(0);
      expect(runGit(['add', '.']).status).toBe(0);
      expect(runGit(['commit', '-m', 'base']).status).toBe(0);
      const baseSha = runGit(['rev-parse', 'HEAD']).stdout.trim();
      writeFileSync(changedPath, 'export const value = 2;\n');
      expect(runGit(['add', '.']).status).toBe(0);
      expect(runGit(['commit', '-m', 'change product tool']).status).toBe(0);

      const result = spawnSync(
        process.execPath,
        [resolve(REPO_ROOT, 'scripts/ci-fast-lanes.mjs')],
        {
          cwd: repo,
          encoding: 'utf8',
          env: {
            ...process.env,
            CI_FAST_LANE_GROUP: 'remaining',
            CI_FAST_LANES_OUT: outPath,
            CI_FAST_SKIP_STRUCTURAL: 'true',
            // Structural steps set CI_FAST_ONLY_STRUCTURAL=true in the runner
            // env; spawned ci-fast-lanes.mjs children inherit it and would
            // filter the lane list down to structural only. Pin it off here.
            CI_FAST_ONLY_STRUCTURAL: 'false',
            CI_PRODUCT_LANES: 'none',
            GITHUB_EVENT_NAME: 'pull_request',
            GITHUB_BASE_REF: 'main',
            TURBO_SCM_BASE: baseSha,
            PATH: `${binDir}:${process.env.PATH}`,
          },
        }
      );

      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      const payload = JSON.parse(readFileSync(outPath, 'utf8'));
      expect(payload.lanes).toContainEqual(
        expect.objectContaining({
          id: 'scripts-typecheck',
          status: 'success',
          logExcerpt: 'run typecheck:scripts',
        })
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('fails red when hydration is skipped but the exact diff requires typecheck', () => {
    const repo = mkdtempSync(join(tmpdir(), 'ci-fast-selector-mismatch-'));
    const outPath = join(repo, 'ci-fast-lanes.json');
    const runGit = args =>
      spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
    try {
      expect(runGit(['init', '--initial-branch=main']).status).toBe(0);
      expect(
        runGit(['config', 'user.email', 'ci-contract@jov.ie']).status
      ).toBe(0);
      expect(runGit(['config', 'user.name', 'CI Contract']).status).toBe(0);
      mkdirSync(join(repo, 'apps/web'), { recursive: true });
      writeFileSync(
        join(repo, 'apps/web/package.json'),
        '{"name":"@jovie/web","scripts":{"typecheck":"tsc"}}\n'
      );
      expect(runGit(['add', '.']).status).toBe(0);
      expect(runGit(['commit', '-m', 'base']).status).toBe(0);
      const baseSha = runGit(['rev-parse', 'HEAD']).stdout.trim();
      writeFileSync(
        join(repo, 'apps/web/package.json'),
        '{"name":"@jovie/web","scripts":{"typecheck":"tsc -b"}}\n'
      );
      expect(runGit(['add', '.']).status).toBe(0);
      expect(runGit(['commit', '-m', 'change typecheck graph']).status).toBe(0);

      const result = spawnSync(
        process.execPath,
        [resolve(REPO_ROOT, 'scripts/ci-fast-lanes.mjs')],
        {
          cwd: repo,
          encoding: 'utf8',
          env: {
            ...process.env,
            CI_FAST_LANE_GROUP: 'typecheck',
            CI_FAST_LANES_OUT: outPath,
            CI_FAST_ONLY_STRUCTURAL: 'false',
            GITHUB_EVENT_NAME: 'pull_request',
            GITHUB_BASE_REF: 'main',
            TURBO_SCM_BASE: baseSha,
            // Model a false-negative preselector: setup was skipped, so pnpm
            // is intentionally unavailable. The lane must execute and fail.
            PATH: repo,
          },
        }
      );

      expect(result.status).not.toBe(0);
      const payload = JSON.parse(readFileSync(outPath, 'utf8'));
      expect(payload.lanes).toEqual([
        expect.objectContaining({ id: 'typecheck', status: 'failure' }),
      ]);
      expect(payload.lanes[0].logExcerpt).toMatch(/pnpm.*not found/i);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('does not restore or save an unused local Turbo cache in either fast job', () => {
    for (const { jobId, nextJobId } of HOSTED_GROUP_JOBS) {
      const block = jobBlock(jobId, nextJobId);
      expect(block).not.toContain('name: Cache Turbo');
      expect(block).not.toContain('path: .turbo');
      expect(block).not.toContain('runner.os }}-turbo-');
    }

    expect(CI_FAST_SOURCE).toContain('pnpm turbo typecheck --affected --force');
    expect(CI_FAST_SOURCE).not.toContain('turbo run');
  });

  it('isolates Jovie product typecheck from Symphony/control-plane suites', () => {
    expect(CI_FAST_SOURCE).toContain("from './lib/ci-repo-lanes.mjs'");
    expect(CI_FAST_SOURCE).toContain(
      'Jovie product typecheck skipped (no product files changed)'
    );
    const scriptsTypecheck = CI_FAST_SOURCE.slice(
      CI_FAST_SOURCE.indexOf('function runScriptsTypecheck()'),
      CI_FAST_SOURCE.indexOf('function runGuardrails()')
    );
    expect(scriptsTypecheck).toContain('pnpm run typecheck:scripts');
    expect(scriptsTypecheck).not.toContain('changedFiles');
    expect(scriptsTypecheck).not.toContain('runSymphonyControl');
    expect(CI_FAST_SOURCE).toContain(
      'Guardrails skipped (no Jovie product files changed)'
    );
    expect(CI_FAST_SOURCE).toContain(
      'Design conformance skipped (no design-domain files changed)'
    );
    expect(CI_FAST_SOURCE).toContain(
      'Design-system source ratchet skipped (no Jovie product files changed)'
    );
    expect(CI_FAST_SOURCE).toContain(
      'Design exception registry skipped (no Jovie product files changed)'
    );
    expect(CI_FAST_SOURCE).toContain(
      'Public-profile admission skipped (no Jovie product files changed)'
    );
    expect(CI_FAST_SOURCE).toContain(
      'Structural skipped (Summer/ops only; no Jovie or Symphony suites)'
    );
    expect(CI_FAST_SOURCE).toContain('No guardrail product lane selected');
    expect(CI_FAST_SOURCE).toContain(
      "process.env.CI_PRODUCT_LANES || 'ios,mac,web,operations,cross-product'"
    );
    expect(CI_FAST_SOURCE).toContain('files === null || files.length === 0');
  });

  it('runs the official Symphony recovery ownership contract with exact changed-line coverage', () => {
    expect(PACKAGE_JSON.scripts['invariants:check']).toContain(
      'python3 scripts/symphony/tests/symphony-codex-auth-fallback.test.py OfficialServiceOwnershipContract OfficialServiceCoverageContract'
    );
    expect(CI_FAST_SOURCE).toContain(
      'COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-symphony-recovery.coverage"'
    );
    expect(CI_FAST_SOURCE).toContain(
      'python3 -m coverage run --branch scripts/symphony/tests/symphony-codex-auth-fallback.test.py OfficialServiceOwnershipContract'
    );
    expect(CI_FAST_SOURCE).toContain(
      'python3 -m coverage json -o "${RUNNER_TEMP:-/tmp}/jovie-symphony-recovery.json"'
    );
    expect(CI_FAST_SOURCE).toContain(
      'python3 scripts/symphony/tests/symphony-codex-auth-fallback.test.py --verify-ownership-coverage "${RUNNER_TEMP:-/tmp}/jovie-symphony-recovery.json"'
    );
  });

  it('runs the Astra readiness contract with branch coverage', () => {
    expect(CI_FAST_SOURCE).toContain(
      'python3 -m coverage run --branch scripts/symphony/tests/astra-readiness.test.py'
    );
    expect(CI_FAST_SOURCE).toContain(
      '--include="*/scripts/symphony/astra/astra_readiness.py" --show-missing --precision=2 --fail-under=90'
    );
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
      'guardrails',
      'design-system-source-ratchet',
      'design-exception-registry',
      'design-conformance',
      'ios-fast',
      'profile-admission',
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
      'design-conformance': 'pnpm design:conformance:gate',
      'eslint-server-boundaries':
        'pnpm --filter=@jovie/web run lint:server-boundaries',
      typecheck: 'pnpm run typecheck',
      'scripts-typecheck': 'pnpm run typecheck:scripts',
      guardrails: 'pnpm next:proxy-guard',
      'design-system-source-ratchet': 'pnpm design:source-count-ratchet',
      'design-exception-registry': 'pnpm design:exception-registry:check',
      'ios-fast': 'pnpm run ios:lint',
      'profile-admission':
        'pnpm --filter @jovie/web exec vitest run --config=vitest.config.mts lib/profile/capture-dismissal-client.test.ts components/features/release/SmartLinkProviderButton.test.tsx tests/unit/api/profile/capture-dismissal.test.ts tests/unit/api/profile/pac-event.test.ts tests/unit/lib/rate-limit/config.test.ts tests/unit/lib/rate-limit/limiters.test.ts tests/unit/profile/ProfileHomeRail.test.tsx tests/unit/cookie-banner-fixes.test.tsx tests/unit/tracking/pac-events.test.ts',
      structural:
        'pnpm invariants:check && pnpm ci:harness:check && pnpm ci:control:test && pnpm ci:merge-queue:check && pnpm next:proxy-guard && pnpm tailwind:check && pnpm --filter=@jovie/web run lint:no-native-dialogs && pnpm --filter=@jovie/web run lint:seo && pnpm --filter=@jovie/web run lint:contrast-ratchet && pnpm design:shared-ui-visual-arbitrary:check && pnpm component-ship-gate && pnpm screen-registration-gate && pnpm doc:freshness:check && pnpm test:reliability-detectors',
    });
    expect(CI_FAST_SOURCE).toContain(
      "'pnpm design:shared-ui-visual-arbitrary:check'"
    );
  });

  it('keeps the iOS design gate independent from Ubuntu operations', () => {
    const remaining = jobBlock(
      'ci-fast-remaining',
      'ci-profile-admission-browser'
    );
    const structuralDecision = remaining.slice(
      remaining.indexOf('- name: Decide structural lane'),
      remaining.indexOf('- name: Install actionlint')
    );

    expect(LANE_GROUPS.remaining).toContain('design-conformance');
    expect(LANE_GROUPS.remaining).toContain('design-system-source-ratchet');
    expect(LANE_GROUPS.remaining).toContain('design-exception-registry');
    expect(LANE_COMMANDS['design-conformance']).toBe(
      'pnpm design:conformance:gate'
    );
    expect(LANE_COMMANDS['design-system-source-ratchet']).toBe(
      'pnpm design:source-count-ratchet'
    );
    expect(LANE_COMMANDS['design-system-source-ratchet']).not.toMatch(
      /vitest|playwright|e2e/i
    );
    expect(LANE_COMMANDS['design-exception-registry']).toBe(
      'pnpm design:exception-registry:check'
    );
    expect(LANE_COMMANDS['design-exception-registry']).not.toMatch(
      /vitest|playwright|e2e/i
    );
    expect(LANE_COMMANDS['design-conformance']).not.toMatch(
      /backlog|hermes|symphony|systemd/i
    );
    expect(structuralDecision).not.toContain('apps/ios/');
    expect(structuralDecision).toContain('echo "skip=true"');
    expect(structuralDecision).toContain(
      'scripts/backlog-orchestrator/(admission-gate|context-gate|deterministic-gates|gbrain-client|gate-next-hold|ownership-inventory|symphony-(routing|official-runtime))'
    );
    expect(structuralDecision).toContain(
      'scripts/backlog-orchestrator/__tests__/(backlog-orchestrator|pre-lease-gates|gate-next-hold|ownership-inventory|symphony-(routing|official-runtime))\\.test\\.mjs$'
    );
    expect(structuralDecision).toContain('canon/invariants\\.jsonl');
    expect(structuralDecision).toContain('scripts/invariants/');
    expect(CI_FAST_SOURCE).toMatch(
      /function runDesignConformance\([^)]*\)[\s\S]*LANE_COMMANDS\['design-conformance'\]/
    );
    expect(CI_FAST_SOURCE).toMatch(
      /function runDesignSystemSourceRatchet\(\)[\s\S]*LANE_COMMANDS\['design-system-source-ratchet'\]/
    );
    expect(CI_FAST_SOURCE).toMatch(
      /function runDesignExceptionRegistry\(\)[\s\S]*LANE_COMMANDS\['design-exception-registry'\]/
    );
  });

  it('fails closed onto structural UI gates for every web UI source and guard', () => {
    const remaining = jobBlock(
      'ci-fast-remaining',
      'ci-profile-admission-browser'
    );
    const structuralDecision = remaining.slice(
      remaining.indexOf('- name: Decide structural lane'),
      remaining.indexOf('- name: Install actionlint')
    );

    for (const requiredPath of [
      'apps/web/app/.*\\.(tsx|css)$',
      'apps/web/components/',
      'apps/web/\\.storybook/',
      'apps/web/package\\.json$',
      'apps/web/scripts/',
      'apps/web/tests/',
      'apps/web/styles/',
      'packages/ui/',
      'chromatic\\.config\\.json$',
      'package\\.json$',
      'DESIGN\\.md$',
      'design\\.tokens\\.json$',
      'scripts/(component-',
      'screen-certification',
      'shared-ui-visual-arbitrary',
      'story-coverage',
      'ui-story-coverage',
      'scripts/lib/__tests__/(component-',
    ]) {
      expect(structuralDecision).toContain(requiredPath);
    }
    expect(structuralDecision).toContain(
      'grep -qE "$STRUCTURAL_CONTROL_PATTERN|$STRUCTURAL_UI_PATTERN"'
    );
    expect(remaining).toMatch(/timeout-minutes:\s*40/);
    expect(remaining).toContain('uses: ./.github/actions/setup-playwright');
    expect(CI_FAST_SOURCE).toContain(
      'lib/__tests__/component-live-storybook-certification.test.mjs'
    );
  });

  it('runs the lockfile specifier preflight before expensive fast lanes', () => {
    const preflight = jobBlock('ci-lockfile-preflight', 'ci-path-changes');
    expect(preflight).toContain('name: Lockfile Specifier Preflight');
    expect(preflight).toContain(
      'run: pnpm exec node scripts/lockfile-specifier-preflight.mjs'
    );
    for (const { jobId, nextJobId } of HOSTED_GROUP_JOBS) {
      expect(jobBlock(jobId, nextJobId)).toMatch(
        /needs: \[ci-lockfile-preflight, ci-path-changes, ci-merge-group-admission\]/
      );
    }
  });

  it('keeps workflow contracts in the bounded CI control suite', () => {
    const controlTest = PACKAGE_JSON.scripts['ci:control:test'];

    expect(controlTest).toBe('node scripts/run-affected-tests.mjs --control');
  });

  it('enforces meaningful Gem rehabilitation policy coverage in structural CI', () => {
    const remaining = jobBlock(
      'ci-fast-remaining',
      'ci-profile-admission-browser'
    );

    expect(remaining).toContain(
      'scripts/symphony/(closure_health\\.py$|config/(gem-repo-registry|model-registry)\\.json$|evaluate-fleet-gate\\.sh$|fleet_admission_receipt\\.py$|gbrain-runtime/|gem-|gem_|hyperagent/|install-(gem-(fleet-controller|pr-rehabilitation)|symphony-ui-pilot)\\.sh$|model-router\\.py$|symphony-nvme-package-cache\\.sh$|symphony-reconciler\\.py$|systemd/gem-(disk-reclaim|pr-drain)\\.(service|timer)$)'
    );
    expect(remaining).toContain('gbrain-runtime-assets|merge-group');
    expect(CI_FAST_SOURCE).toContain(
      'GBRAIN_PROXY_COVERAGE=1 pnpm exec vitest --root scripts'
    );
    expect(CI_FAST_SOURCE).toContain('--precision=2 --fail-under=78');
    expect(CI_FAST_SOURCE).toContain('elif [ "${CI:-}" = "true" ]');
    expect(CI_FAST_SOURCE).not.toContain('elif [[');
    expect(remaining).toContain(
      'scripts/symphony/tests/(closure-health\\.test\\.py$|gem-(disk-reclaim|pr-drain|ops-hud|pr-rehabilitation-contract|priority-gate|rehabilitation-policy)\\.test\\.py$|hyperagent-lifecycle\\.test\\.py$|symphony-(nvme-package-cache|reconciler)\\.test\\.py$|test(-model-router|_evaluate_fleet_gate|_fleet_admission_receipt|_gem_disk_reclaim)\\.py$)'
    );
    expect(CI_FAST_SOURCE).toContain(
      'coverage run --branch scripts/symphony/tests/gem-rehabilitation-policy.test.py'
    );
    expect(CI_FAST_SOURCE).toContain(
      'coverage report --include="*/scripts/symphony/gem_rehabilitation_policy.py" --fail-under=90'
    );
    expect(CI_FAST_SOURCE).toContain(
      "node --test --test-name-pattern='keeps the Gem drain on typed fleet admission' scripts/backlog-orchestrator/__tests__/backlog-orchestrator.test.mjs"
    );
    for (const gemContractCommand of [
      'python3 scripts/symphony/tests/run-hud-proof-gate.py',
      'python3 scripts/symphony/tests/test_gem_disk_reclaim.py',
      'python3 scripts/symphony/tests/gem-pr-drain.test.py',
      'python3 scripts/symphony/tests/gem-pr-rehabilitation-contract.test.py',
      'python3 scripts/symphony/tests/gem-priority-gate.test.py',
      'python3 scripts/symphony/tests/symphony-nvme-package-cache.test.py',
      'python3 scripts/symphony/tests/test_evaluate_fleet_gate.py',
      'python3 scripts/symphony/tests/test-model-router.py',
      'python3 -m coverage run --branch scripts/symphony/tests/hyperagent-lifecycle.test.py',
      'python3 scripts/symphony/tests/symphony-github-poke.test.py',
    ]) {
      expect(CI_FAST_SOURCE).toContain(gemContractCommand);
    }
    expect(CI_FAST_SOURCE).toContain(
      '--include="*/scripts/symphony/hyperagent/lifecycle.py" --show-missing --precision=2 --fail-under=95'
    );
    expect(CI_FAST_SOURCE).toContain(
      'node --test scripts/backlog-orchestrator/__tests__/pre-lease-gates.test.mjs'
    );
    expect(CI_FAST_SOURCE).toContain(
      'node --test scripts/backlog-orchestrator/__tests__/gate-next-hold.test.mjs'
    );
    expect(CI_FAST_SOURCE).toContain(
      'node --test scripts/backlog-orchestrator/__tests__/ownership-inventory.test.mjs'
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
      expect(payload.schemaVersion).toBe(2);
      expect(payload.job).toBe('ci-fast');
      expect(payload.group).toBe('not-a-real-group');
      expect(payload.lanes).toEqual([]);
      expect(String(payload.setupError)).toMatch(/Unknown CI_FAST_LANE_GROUP/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('records a non-negative duration for every emitted lane receipt', () => {
    expect(CI_FAST_SOURCE).toContain('durationMs');
    expect(CI_FAST_SOURCE).toContain('laneStartedAt');
    expect(CI_FAST_SOURCE).toContain('Date.now() - laneStartedAt');
  });

  it('uploads ci-fast lane artifacts with warn-not-error missing policy (JOV-4446)', () => {
    for (const { jobId, nextJobId } of HOSTED_GROUP_JOBS) {
      const block = jobBlock(jobId, nextJobId);
      expect(block).toContain(
        'CI_FAST_LANES_OUT: ${{ runner.temp }}/ci-fast-lanes.json'
      );
      expect(block).toContain('${{ runner.temp }}/ci-fast-lanes.json');
      expect(block).toContain('if-no-files-found: warn');
      expect(block).toMatch(
        /github\.event_name == 'merge_group' && github\.event\.merge_group\.base_sha/
      );
    }
  });

  it('defers structural Playwright/Python until cheap remaining lanes pass', () => {
    const remaining = jobBlock(
      'ci-fast-remaining',
      'ci-profile-admission-browser'
    );
    const cheapLanes = remaining.indexOf('- name: Run ci-fast lanes');
    const playwright = remaining.indexOf('Setup Playwright (Chromium)');
    const structuralLane = remaining.indexOf(
      '- name: Run structural ci-fast lane'
    );
    expect(cheapLanes).toBeGreaterThan(0);
    expect(playwright).toBeGreaterThan(cheapLanes);
    expect(structuralLane).toBeGreaterThan(playwright);
    expect(remaining).toContain("CI_FAST_SKIP_STRUCTURAL: 'true'");
    expect(remaining).toContain("CI_FAST_ONLY_STRUCTURAL: 'true'");
    expect(remaining).toContain(
      "if: ${{ success() && steps.structural.outputs.skip != 'true' }}"
    );
  });

  it('fail-fast skips later remaining lanes after the first failure', () => {
    const repo = mkdtempSync(join(tmpdir(), 'ci-fast-fail-fast-'));
    const outPath = join(repo, 'ci-fast-lanes.json');
    try {
      const result = spawnSync(
        process.execPath,
        [resolve(REPO_ROOT, 'scripts/ci-fast-lanes.mjs')],
        {
          cwd: repo,
          encoding: 'utf8',
          env: {
            ...process.env,
            CI_FAST_LANE_GROUP: 'remaining',
            CI_FAST_LANES_OUT: outPath,
            CI_FAST_SKIP_STRUCTURAL: 'true',
            CI_FAST_ONLY_STRUCTURAL: 'false',
            PATH: repo,
          },
        }
      );
      expect(result.status).not.toBe(0);
      const payload = JSON.parse(readFileSync(outPath, 'utf8'));
      const failed = payload.lanes.filter(lane => lane.status === 'failure');
      const skipped = payload.lanes.filter(
        lane =>
          lane.status === 'skipped' &&
          String(lane.logExcerpt).includes('fail-fast')
      );
      expect(failed.length).toBe(1);
      expect(skipped.length).toBeGreaterThan(0);
      expect(payload.lanes.at(-1).status).toBe('skipped');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('keeps structural setup out of typecheck and fails closed in the aggregate', () => {
    const typecheck = jobBlock('ci-fast-typecheck', 'ci-fast-remaining');
    const remaining = jobBlock(
      'ci-fast-remaining',
      'ci-profile-admission-browser'
    );
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
      /needs:\s*\[\s*ci-path-changes,\s*ci-merge-group-admission,\s*ci-fast-typecheck,\s*ci-fast-remaining,\s*ci-profile-admission-browser,\s*\]/s
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
      /PROFILE_BROWSER_RESULT: \$\{\{ needs\.ci-profile-admission-browser\.result \}\}/
    );
    expect(aggregate).toMatch(
      /\[\[ "\$TYPECHECK_RESULT" != "success" \|\| "\$REMAINING_RESULT" != "success" \|\| "\$PROFILE_BROWSER_RESULT" != "success" \]\]/
    );
    expect(aggregate).not.toContain('GROUP_RESULT');
    expect(aggregate).toMatch(/exit 1/);
  });

  it('runs a bounded public-profile admission subset on source and merge-group heads', () => {
    expect(LANE_GROUPS.remaining).toContain('profile-admission');
    expect(LANE_COMMANDS['profile-admission']).toContain(
      'tests/unit/api/profile/capture-dismissal.test.ts'
    );
    expect(LANE_COMMANDS['profile-admission']).toContain(
      'lib/profile/capture-dismissal-client.test.ts'
    );
    expect(LANE_COMMANDS['profile-admission']).toContain(
      'components/features/release/SmartLinkProviderButton.test.tsx'
    );
    expect(LANE_COMMANDS['profile-admission']).toContain(
      'tests/unit/api/profile/pac-event.test.ts'
    );
    expect(LANE_COMMANDS['profile-admission']).toContain(
      'tests/unit/cookie-banner-fixes.test.tsx'
    );
    expect(LANE_COMMANDS['profile-admission']).toContain(
      'tests/unit/profile/ProfileHomeRail.test.tsx'
    );
    expect(CI_FAST_SOURCE).toContain(
      ':(glob)apps/web/app/\\\\[username\\\\]/**'
    );
    expect(CI_FAST_SOURCE).not.toContain("'apps/web/app/[username]/**'");

    const browser = jobBlock('ci-profile-admission-browser', 'ci-fast');
    expect(browser).toContain('tests/e2e/profile-admission.spec.ts');
    expect(browser).toContain('--config=playwright.config.noauth.ts');
    expect(browser).toContain('--project=chromium');
    expect(browser).toContain("PLAYWRIGHT_ARTIFACT_ALLOW_IMAGES: 'true'");
    expect(browser).toContain(
      "PLAYWRIGHT_ARTIFACT_ALLOW_PUBLIC_IMAGES: 'true'"
    );
    expect(browser).toContain(
      "PLAYWRIGHT_ARTIFACT_REQUIRE_PRODUCER_STAGE: 'true'"
    );
    expect(browser).toContain("allow-images: 'true'");
    expect(browser).toContain("public-images: 'true'");
    expect(browser).toContain('Upload profile admission evidence');
    expect(browser).toMatch(/github\.event_name.*merge_group/);
    expect(browser).toMatch(/github\.event_name.*pull_request/);
    expect(browser).toContain('git diff --diff-filter=ACDMRT --name-only');
    expect(browser).toContain(':(glob)apps/web/app/\\[username\\]/**');
    // Workflow-only changes are covered by the deterministic CI contract
    // suite. They must not boot a public-profile runtime server and browser
    // unless a profile surface or its selector changed.
    expect(browser).not.toContain("'.github/workflows/ci.yml'");
    expect(browser).not.toContain("'scripts/ci-fast-lanes.mjs'");
    expect(CI_FAST_SOURCE).not.toContain("    '.github/workflows/ci.yml',");
    const selectIdx = browser.indexOf('id: profile-browser');
    const installIdx = browser.indexOf(
      'uses: ./.github/actions/setup-node-pnpm'
    );
    expect(selectIdx).toBeGreaterThan(0);
    expect(installIdx).toBeGreaterThan(selectIdx);
    expect(browser).toMatch(
      /uses: \.\/\.github\/actions\/setup-node-pnpm\n\s+if: steps\.profile-browser\.outputs\.run == 'true'/
    );
    for (const requiredPath of [
      'apps/web/app/(marketing)/renders/profile-admission/**',
      'apps/web/components/features/release/SmartLinkProviderButton.tsx',
      'apps/web/components/organisms/CookieBannerMount.tsx',
      'apps/web/components/organisms/CookieBannerSection.tsx',
      'apps/web/lib/cookies/**',
      'apps/web/lib/tracking/pac-**',
      'apps/web/styles/design-system.css',
      'apps/web/tests/e2e/profile/**',
      'apps/web/tests/e2e/utils/profile-route-matrix.ts',
      'apps/web/tests/e2e/utils/public-profile-**',
      'apps/web/tests/e2e/utils/public-surface-**',
    ]) {
      expect(browser).toContain(requiredPath);
      expect(CI_FAST_SOURCE).toContain(requiredPath);
    }
  });

  it('keeps deleted files in public-profile admission selection', () => {
    expect(CI_FAST_SOURCE).toContain(
      'git diff --diff-filter=ACDMRT --name-only'
    );
    expect(CI_FAST_SOURCE).not.toContain(
      'git diff --diff-filter=d --name-only'
    );
    const browser = jobBlock('ci-profile-admission-browser', 'ci-fast');
    expect(browser).toContain('git diff --diff-filter=ACDMRT --name-only');
  });

  it('path-selects both workflow contracts and excludes unrelated tests', () => {
    const remaining = jobBlock(
      'ci-fast-remaining',
      'ci-profile-admission-browser'
    );
    const controlPattern = remaining.match(
      /STRUCTURAL_CONTROL_PATTERN='([^']+)'/
    )?.[1];
    const uiPattern = remaining.match(/STRUCTURAL_UI_PATTERN='([^']+)'/)?.[1];
    expect(controlPattern).toBeDefined();
    expect(uiPattern).toBeDefined();

    const selectsStructural = new RegExp(`${controlPattern}|${uiPattern}`);
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
      selectsStructural.test('scripts/verification/admission-shadow.mjs')
    ).toBe(true);
    for (const mergeQueueControllerPath of [
      'scripts/automation-verify.sh',
      'scripts/run-affected-tests.mjs',
      'scripts/backlog-orchestrator/__tests__/backlog-orchestrator.test.mjs',
      'scripts/drain-pr-queue.sh',
      'scripts/drain-pr-remediate.mjs',
      'scripts/merge-queue-backend.mjs',
      'scripts/ownerless-recovery-sweeper.mjs',
      'scripts/lib/ownerless-recovery-policy.mjs',
      'scripts/lib/pr-check-failures.mjs',
      'scripts/lib/pre-land-changelog.mjs',
      'scripts/lib/resolve-merge-group-path-diff.mjs',
      'scripts/lib/upsert-pr-comment.sh',
      'scripts/lib/__tests__/automation-verify.test.mjs',
      'scripts/lib/__tests__/merge-queue-backend.test.mjs',
      'scripts/lib/__tests__/merge-queue-guard.test.mjs',
      'scripts/lib/__tests__/ownerless-recovery-policy.test.mjs',
      'scripts/lib/__tests__/pre-land-changelog.test.mjs',
      'scripts/lib/__tests__/pr-check-failures.test.mjs',
      'scripts/tests/test_gh_retry.py',
      'scripts/tests/test_runner_routing.py',
      'scripts/tests/test_symphony_ui_pilot_runtime.py',
      'scripts/tests/test_symphony_reconciler_runtime.py',
      'scripts/symphony/closure_health.py',
      'scripts/symphony/config/gem-repo-registry.json',
      'scripts/symphony/config/model-registry.json',
      'scripts/symphony/evaluate-fleet-gate.sh',
      'scripts/symphony/fleet_admission_receipt.py',
      'scripts/symphony/gem-disk-reclaim.py',
      'scripts/symphony/install-gem-fleet-controller.sh',
      'scripts/symphony/install-symphony-ui-pilot.sh',
      'scripts/symphony/model-router.py',
      'scripts/symphony/symphony-nvme-package-cache.sh',
      'scripts/symphony/symphony-reconciler.py',
      'scripts/symphony/systemd/gem-disk-reclaim.service',
      'scripts/symphony/systemd/gem-disk-reclaim.timer',
      'scripts/symphony/systemd/gem-pr-drain.service',
      'scripts/symphony/systemd/gem-pr-drain.timer',
      'scripts/symphony/tests/closure-health.test.py',
      'scripts/symphony/tests/gem-pr-drain.test.py',
      'scripts/symphony/tests/gem-ops-hud.test.py',
      'scripts/symphony/tests/gem-pr-rehabilitation-contract.test.py',
      'scripts/symphony/tests/gem-priority-gate.test.py',
      'scripts/symphony/tests/gem-rehabilitation-policy.test.py',
      'scripts/symphony/tests/symphony-nvme-package-cache.test.py',
      'scripts/symphony/tests/symphony-reconciler.test.py',
      'scripts/symphony/tests/test_gem_disk_reclaim.py',
      'scripts/symphony/tests/test-model-router.py',
      'scripts/symphony/tests/test_evaluate_fleet_gate.py',
      'scripts/symphony/tests/test_fleet_admission_receipt.py',
    ]) {
      expect(selectsStructural.test(mergeQueueControllerPath)).toBe(true);
    }
    expect(selectsStructural.test('.github/workflows/ci.yml')).toBe(true);
    expect(selectsStructural.test('.claude/rules/ci-branching.md')).toBe(true);
    expect(CI_FAST_SOURCE).toContain(
      "--test-coverage-include='scripts/verification/*.mjs'"
    );
    expect(CI_FAST_SOURCE).toContain('--test-coverage-branches=98');
    expect(selectsStructural.test('apps/web/components/atoms/Button.tsx')).toBe(
      true
    );
    expect(selectsStructural.test('apps/web/app/(home)/page.tsx')).toBe(true);
    expect(selectsStructural.test('packages/ui/atoms/badge.tsx')).toBe(true);
    expect(selectsStructural.test('scripts/component-ship-gate.mjs')).toBe(
      true
    );
    expect(
      selectsStructural.test('apps/web/tests/unit/atoms/ViaPanel.test.tsx')
    ).toBe(true);
    expect(
      new RegExp(uiPattern).test('apps/web/tests/unit/atoms/ViaPanel.test.tsx')
    ).toBe(true);
    expect(
      new RegExp(uiPattern).test('apps/web/components/atoms/Button.test.tsx')
    ).toBe(true);
    expect(new RegExp(uiPattern).test('packages/ui/atoms/badge.test.tsx')).toBe(
      true
    );
    for (const receiptRepairPath of [
      'apps/web/tests/components/organisms/RightDrawer.interaction.test.tsx',
      'apps/web/tests/unit/marketing/component-registry.test.ts',
      'apps/web/tests/unit/marketing/support-route-header-contract.test.ts',
      'apps/web/tests/e2e/utils/public-surface-manifest.ts',
    ]) {
      expect(selectsStructural.test(receiptRepairPath)).toBe(true);
    }
    // These paths feed the live rendered component harness, not just the
    // shadow UI-story audit; a harness change must not skip runStructural.
    for (const storybookHarnessPath of [
      'apps/web/.storybook/main.ts',
      'apps/web/.storybook/preview.tsx',
      'apps/web/.storybook/stories/elevation-matrix.stories.tsx',
      'chromatic.config.json',
    ]) {
      expect(selectsStructural.test(storybookHarnessPath)).toBe(true);
    }
    for (const tokenAuditPath of [
      'scripts/shared-ui-visual-arbitrary-audit.mjs',
      'scripts/shared-ui-visual-arbitrary-audit.test.mjs',
      'scripts/shared-ui-visual-arbitrary.baseline.json',
    ]) {
      expect(selectsStructural.test(tokenAuditPath)).toBe(true);
    }
    for (const directStructuralInput of [
      'package.json',
      'apps/web/package.json',
      'apps/web/scripts/check-reliability-detectors.ts',
      'apps/web/scripts/lint-contrast-ratchet.mjs',
      'apps/web/scripts/lint-no-native-dialogs.mjs',
      'apps/web/scripts/next-proxy-guard.mjs',
      'apps/web/scripts/seo-ratchet-guard.mjs',
      'apps/web/scripts/tailwind-guard.mjs',
      'scripts/doc-freshness-lint.mjs',
    ]) {
      expect(selectsStructural.test(directStructuralInput)).toBe(true);
    }
    for (const nonUiPath of [
      'apps/web/app/api/health/deploy/route.ts',
      'apps/web/data/designSystem/componentRegistry.ts',
      'apps/web/lib/queries/useDashboardProfileQuery.ts',
      'apps/web/scripts/test-performance-guard.ts',
      'docs/design-system/design-conformance-manifest.json',
      'docs/product/README.md',
      'apps/web/storybook/main.ts',
      'chromatic.config.json.bak',
      'apps/web/tests-not-centralized/unit/foo.test.ts',
    ]) {
      expect(selectsStructural.test(nonUiPath)).toBe(false);
    }
    expect(selectsStructural.test('.claude/skills/qa/SKILL.md')).toBe(false);
    expect(selectsStructural.test('.claude/rules/auth.md')).toBe(false);
  });

  it('runs hosted structural CI for Storybook, Chromatic, and token-guard inputs', () => {
    const remaining = jobBlock(
      'ci-fast-remaining',
      'ci-profile-admission-browser'
    );
    const structuralDecision = remaining.slice(
      remaining.indexOf('- name: Decide structural lane'),
      remaining.indexOf('- name: Install actionlint')
    );
    const controlPattern = remaining.match(
      /STRUCTURAL_CONTROL_PATTERN='([^']+)'/
    )?.[1];
    const uiPattern = remaining.match(/STRUCTURAL_UI_PATTERN='([^']+)'/)?.[1];
    expect(controlPattern).toBeDefined();
    expect(uiPattern).toBeDefined();
    const selectsStructural = new RegExp(`${controlPattern}|${uiPattern}`);
    const uiRe = new RegExp(uiPattern);

    // Source PRs path-gate the remaining structural lane; merge groups never skip.
    expect(structuralDecision).toContain(
      'github.event_name }}" != "pull_request"'
    );
    expect(structuralDecision).toContain('echo "skip=false"');
    expect(remaining).toMatch(/github\.event_name != 'merge_group'/);
    expect(remaining).toMatch(
      /needs\.ci-merge-group-admission\.result == 'success'/
    );

    // Direct rendered-harness and token-guard inputs must select structural.
    expect(uiRe.test('apps/web/.storybook/main.ts')).toBe(true);
    expect(uiRe.test('apps/web/.storybook/preview.tsx')).toBe(true);
    expect(
      uiRe.test('apps/web/.storybook/stories/elevation-matrix.stories.tsx')
    ).toBe(true);
    expect(uiRe.test('chromatic.config.json')).toBe(true);
    expect(uiRe.test('scripts/shared-ui-visual-arbitrary-audit.mjs')).toBe(
      true
    );
    expect(uiRe.test('scripts/shared-ui-visual-arbitrary-audit.test.mjs')).toBe(
      true
    );
    expect(uiRe.test('scripts/shared-ui-visual-arbitrary.baseline.json')).toBe(
      true
    );
    expect(uiRe.test('package.json')).toBe(true);
    expect(uiRe.test('apps/web/package.json')).toBe(true);
    expect(uiRe.test('apps/web/scripts/check-reliability-detectors.ts')).toBe(
      true
    );
    expect(uiRe.test('apps/web/scripts/lint-contrast-ratchet.mjs')).toBe(true);
    expect(uiRe.test('apps/web/scripts/lint-no-native-dialogs.mjs')).toBe(true);
    expect(uiRe.test('apps/web/scripts/next-proxy-guard.mjs')).toBe(true);
    expect(uiRe.test('apps/web/scripts/seo-ratchet-guard.mjs')).toBe(true);
    expect(uiRe.test('apps/web/scripts/tailwind-guard.mjs')).toBe(true);
    expect(selectsStructural.test('scripts/doc-freshness-lint.mjs')).toBe(true);

    // JOV-5435 centralized web-test boundary stays selected.
    expect(uiRe.test('apps/web/tests/unit/atoms/ViaPanel.test.tsx')).toBe(true);
    expect(uiRe.test('apps/web/tests/e2e/smoke-public.spec.ts')).toBe(true);

    // Similar-looking non-inputs must remain excluded.
    expect(uiRe.test('apps/web/storybook/main.ts')).toBe(false);
    expect(uiRe.test('.storybook/main.ts')).toBe(false);
    expect(uiRe.test('apps/desktop/.storybook/preview.tsx')).toBe(false);
    expect(uiRe.test('apps/web/chromatic.config.json')).toBe(false);
    expect(uiRe.test('chromatic.config.js')).toBe(false);
    expect(uiRe.test('docs/chromatic.config.json')).toBe(false);
    expect(uiRe.test('scripts/shared-ui-visual.mjs')).toBe(false);
    expect(uiRe.test('scripts/lib/shared-ui-visual-arbitrary-audit.mjs')).toBe(
      false
    );
    expect(
      uiRe.test('apps/web/scripts/shared-ui-visual-arbitrary-audit.mjs')
    ).toBe(false);
    expect(uiRe.test('apps/web/scripts/test-performance-guard.ts')).toBe(false);
    expect(uiRe.test('apps/web/lib/env.ts')).toBe(false);
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
