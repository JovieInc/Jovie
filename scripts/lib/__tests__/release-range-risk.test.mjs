import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { classifyCiRisk, loadCiHarnessManifest } from '../ci-harness.mjs';
import { planProductionLaneRange } from '../production-lane-range.mjs';
import { journeysRequired } from '../promotion-journey-evidence.mjs';
import { gradeReleaseRange } from '../release-range-risk.mjs';
import { buildReleaseRiskReceipt } from '../release-risk-policy.mjs';

const CLI = fileURLToPath(
  new URL('../release-risk-policy.mjs', import.meta.url)
);
const manifest = loadCiHarnessManifest();
const roots = [];
afterAll(() => roots.forEach(r => rmSync(r, { recursive: true, force: true })));

const git = (cwd, ...args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** Reproduces the 2026-10-21 wave: 63b63b2 tip was low, range was not. */
function buildWave() {
  const dir = mkdtempSync(join(tmpdir(), 'range-risk-'));
  roots.push(dir);
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@example.com');
  git(dir, 'config', 'user.name', 't');
  const commit = (message, files) => {
    for (const [path, body] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), body);
    }
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', message);
    return git(dir, 'rev-parse', 'HEAD');
  };
  const deployed = commit('deployed', { 'README.md': '0' });
  const first = [];
  first.push(commit('config', { 'apps/web/next.config.js': '1' }));
  first.push(
    commit('cron', { 'apps/web/app/api/cron/frequent/route.ts': '1' })
  );
  first.push(commit('proxy', { 'apps/web/proxy.ts': '1' }));
  const tip = commit('copy', { 'apps/web/components/copy.tsx': '1' });
  const changed = (a, b) =>
    git(dir, 'diff', '--name-only', a, b).split('\n').filter(Boolean);
  const shas = [...first, tip];
  const commitsNewestFirst = shas
    .map((sha, i) => ({
      sha,
      firstParent: i === 0 ? deployed : shas[i - 1],
      changedPaths: changed(i === 0 ? deployed : shas[i - 1], sha),
    }))
    .reverse();
  return { dir, deployed, tip, changed, commitsNewestFirst };
}

const tipReceipt = (tip, paths) => {
  const c = classifyCiRisk(paths, manifest);
  return {
    sha: tip,
    risk_level: c.riskLevel,
    requires_smoke: c.requiresSmoke,
    requires_preview: c.requiresPreview,
    blocks_unattended: c.blocksUnattendedAutoMerge,
    matched_rule_ids: c.matchedRules.map(r => r.id),
  };
};

describe('release range risk (2026-10-21 regression)', () => {
  const wave = buildWave();
  const rangePaths = wave.changed(wave.deployed, wave.tip);
  const tipPaths = wave.changed(wave.commitsNewestFirst[1].sha, wave.tip);

  it('fixture: tip commit alone is low, the range is not', () => {
    expect(tipPaths).toEqual(['apps/web/components/copy.tsx']);
    expect(rangePaths).toEqual(
      expect.arrayContaining([
        'apps/web/next.config.js',
        'apps/web/app/api/cron/frequent/route.ts',
        'apps/web/proxy.ts',
      ])
    );
  });

  it('OLD behavior (tip-only receipt, no range) graded this wave low', () => {
    const tip = tipReceipt(wave.tip, tipPaths);
    expect(tip.risk_level).toBe('low');
    // Neutral range = what the pre-fix code implicitly assumed.
    const old = buildReleaseRiskReceipt({
      lineageSha: wave.tip,
      deployableWeb: true,
      mergeAt: '2026-10-21T12:00:00Z',
      riskReceipt: tip,
      rangeRisk: gradeReleaseRange({
        baseDeployedSha: wave.deployed,
        candidateSha: wave.tip,
        paths: tipPaths,
      }),
    });
    expect(old.selectedLane).toBe('low');
  });

  it('NEW behavior grades the complete range high through the CLI', () => {
    const dir = mkdtempSync(join(tmpdir(), 'range-risk-cli-'));
    roots.push(dir);
    const range = planProductionLaneRange({
      deployedSha: wave.deployed,
      currentSha: wave.tip,
      cumulativeChangedPaths: rangePaths,
      commitsNewestFirst: wave.commitsNewestFirst,
    });
    writeFileSync(join(dir, 'range.json'), JSON.stringify(range));
    writeFileSync(
      join(dir, 'release.json'),
      JSON.stringify({
        actualResults: { riskReceipt: tipReceipt(wave.tip, tipPaths) },
      })
    );
    const run = spawnSync(
      process.execPath,
      [
        CLI,
        'plan',
        '--release',
        join(dir, 'release.json'),
        '--range',
        join(dir, 'range.json'),
        '--merge-at',
        '2026-10-21T12:00:00Z',
        '--out',
        join(dir, 'out.json'),
        '--range-risk-out',
        join(dir, 'range-risk.json'),
        '--github-output',
        join(dir, 'gh-out'),
      ],
      { encoding: 'utf8' }
    );
    expect(run.status, run.stderr).toBe(0);
    const receipt = JSON.parse(readFileSync(join(dir, 'out.json'), 'utf8'));
    expect(receipt.selectedLane).toBe('high');
    expect(receipt.requiredProof).toContain('high-confidence-runtime-proof');
    expect(readFileSync(join(dir, 'gh-out'), 'utf8')).toContain(
      'release_requires_smoke=true'
    );
    const artifact = JSON.parse(
      readFileSync(join(dir, 'range-risk.json'), 'utf8')
    );
    expect(artifact).toMatchObject({
      schema: 'jovie.release-range-risk/v1',
      baseDeployedSha: wave.deployed,
      candidateSha: wave.tip,
      unknown: false,
      level: 'high',
      affects: { config: true, proxy: true, automation: true },
    });
    expect(artifact.paths).toEqual(
      expect.arrayContaining([
        { path: 'apps/web/proxy.ts', class: 'proxy-middleware', level: 'high' },
      ])
    );
  });
});

describe('release range risk fail-closed', () => {
  const base = 'b'.repeat(40);
  const cand = 'c'.repeat(40);

  it.each([
    [
      'unclassifiable path',
      {
        baseDeployedSha: base,
        candidateSha: cand,
        paths: ['apps/web/lib/mystery/thing.ts'],
      },
    ],
    [
      'missing deployed SHA',
      { baseDeployedSha: undefined, candidateSha: cand, paths: ['README.md'] },
    ],
    [
      'changed-path API error (no list)',
      { baseDeployedSha: base, candidateSha: cand, paths: undefined },
    ],
  ])('%s is unknown and never low', (_n, input) => {
    const artifact = gradeReleaseRange(input);
    expect(artifact.unknown).toBe(true);
    expect(artifact.level).toBe('high');
    const receipt = buildReleaseRiskReceipt({
      lineageSha: cand,
      deployableWeb: true,
      mergeAt: '2026-10-21T12:00:00Z',
      riskReceipt: {
        sha: cand,
        risk_level: 'low',
        requires_smoke: false,
        requires_preview: false,
        blocks_unattended: false,
      },
      rangeRisk: artifact,
    });
    expect(receipt.selectedLane).toBe('high');
  });

  it('classifier failure is unknown, not low', () => {
    const artifact = gradeReleaseRange({
      baseDeployedSha: base,
      candidateSha: cand,
      paths: ['README.md'],
      manifest: { riskRules: [{ id: 'x', level: 'high', patterns: ['('] }] },
    });
    expect(artifact.unknown).toBe(true);
    expect(artifact.level).toBe('high');
  });

  it('a missing range artifact cannot grade low', () => {
    const receipt = buildReleaseRiskReceipt({
      lineageSha: cand,
      deployableWeb: true,
      mergeAt: '2026-10-21T12:00:00Z',
      riskReceipt: {
        sha: cand,
        risk_level: 'low',
        requires_smoke: false,
        requires_preview: false,
        blocks_unattended: false,
      },
    });
    expect(receipt.selectedLane).toBe('high');
  });

  it.each([
    ['apps/web/proxy.ts', 'proxy-middleware'],
    ['apps/web/next.config.mjs', 'env-config'],
    ['vercel.json', 'env-config'],
    ['pnpm-lock.yaml', 'env-config'],
    ['packages/auth-routing/src/index.ts', 'env-config'],
    ['apps/web/lib/flags/defaults.ts', 'env-config'],
    ['apps/web/lib/claim/takeover.ts', 'auth-identity'],
    ['apps/web/lib/merch/order.ts', 'billing-money'],
    ['apps/web/app/api/stripe-connect/route.ts', 'billing-money'],
    ['apps/web/app/api/webhooks/stripe-connect/route.ts', 'billing-money'],
    ['apps/web/drizzle/0001_x.sql', 'db-migrations'],
  ])('%s classifies as %s', (path, cls) => {
    const artifact = gradeReleaseRange({
      baseDeployedSha: base,
      candidateSha: cand,
      paths: [path],
    });
    expect(artifact.paths[0]).toMatchObject({ class: cls, level: 'high' });
    expect(artifact.unknown).toBe(false);
  });

  it('no path filter names the nonexistent middleware.ts', () => {
    const ci = readFileSync(
      new URL('../../../.github/workflows/ci.yml', import.meta.url),
      'utf8'
    );
    expect(ci).not.toMatch(/middleware\\?\.ts/);
    expect(ci).toMatch(/BUILD_PATTERN=.*apps\/web\/proxy\\\.ts/);
    expect(JSON.stringify(manifest)).not.toMatch(/middleware\\\\\.ts/);
  });
});

describe('release range risk (2026-10-22 gate false-unknown)', () => {
  /**
   * The exact changed-path set of the 2026-10-22 promotion wave
   * a718a69..afb27ba (Production Controller run 39905042790). The gate graded
   * this range unknown because 13 path families matched no risk rule and no
   * known-safe pattern, so a non-auth/billing range demanded journey evidence
   * it had no way to obtain. Every family below must stay classified forever.
   */
  const INCIDENT_PATHS = [
    '.claude/rules/ui.md',
    '.github/ci-harness/manifest.json',
    '.github/ci-harness/structural-control-paths.ere',
    '.github/scripts/controller-quota-replay.mjs',
    '.github/scripts/controller-quota-replay.test.mjs',
    '.github/scripts/pen-still-diff-comment.mjs',
    '.github/scripts/pen-still-diff-comment.test.mjs',
    '.github/scripts/release-lineage-gate.sh',
    '.github/ui-story-coverage-policy.json',
    '.github/workflow-topology.gen.yml',
    '.github/workflows/ci.yml',
    '.github/workflows/pen-still-diff.yml',
    '.github/workflows/production-controller.yml',
    '.github/workflows/ui-story-coverage-audit.yml',
    'DESIGN.md',
    'apps/web/.storybook/main.ts',
    'apps/web/.storybook/preview.tsx',
    'apps/web/app/(marketing)/product/ProductLanding.test.tsx',
    'apps/web/app/app/(shell)/dashboard/PreviewPanelContext.tsx',
    'apps/web/app/app/(shell)/dashboard/profile/ProfilePreviewOpener.test.tsx',
    'apps/web/app/app/(shell)/dashboard/profile/ProfilePreviewOpener.tsx',
    'apps/web/components/features/dashboard/dashboard-nav/DashboardNav.test.tsx',
    'apps/web/components/features/dashboard/dashboard-nav/DashboardNav.tsx',
    'apps/web/components/features/dashboard/tasks/TasksPageClient.tsx',
    'apps/web/components/features/profile/templates/ProfileCompactTemplate.tsx',
    'apps/web/components/jovie/JovieChatSections.test.tsx',
    'apps/web/components/jovie/JovieChatSections.tsx',
    'apps/web/components/organisms/UnifiedSidebar.stories.tsx',
    'apps/web/components/shell/AppShellRightRail.stories.tsx',
    'apps/web/components/shell/SidebarThreadsSection.test.tsx',
    'apps/web/components/shell/SidebarThreadsSection.tsx',
    'apps/web/components/shell/Tooltip.stories.tsx',
    'apps/web/components/shell/Tooltip.test.tsx',
    'apps/web/components/shell/Tooltip.tsx',
    'apps/web/components/shell/useRailPreview.test.tsx',
    'apps/web/components/shell/useRailPreview.ts',
    'apps/web/data/homepageCopy.ts',
    'apps/web/data/product-truth/golden-path-claims.ts',
    'apps/web/data/product-truth/golden-path-proof.gen.json',
    'apps/web/lib/ovie/generated/performance-invariants-v1.json',
    'apps/web/package.json',
    'apps/web/scripts/performance-route-manifest.ts',
    'apps/web/tests/e2e/golden-path-waitlist-local.spec.ts',
    'apps/web/tests/e2e/profile.spec.ts',
    'apps/web/tests/e2e/start-onboarding-chat.spec.ts',
    'apps/web/tests/e2e/storybook-chat-tooltip-rail.spec.ts',
    'apps/web/tests/e2e/utils/public-surface-manifest.ts',
    'apps/web/tests/unit/ci/visual-ci-harness.test.ts',
    'apps/web/tests/unit/dashboard/PreviewPanelContext.scope.test.tsx',
    'apps/web/tests/unit/dashboard/TasksPageClient.test.tsx',
    'apps/web/tests/unit/e2e/noauth-playwright-config.test.ts',
    'apps/web/tests/unit/marketing/correction-guards.ts',
    'apps/web/tests/unit/marketing/correction-pyramid-guards.test.ts',
    'apps/web/tests/unit/profile/profile-compact-template.test.tsx',
    'canon/invariants.jsonl',
    'canon/ownership.json',
    'chromatic.config.json',
    'codecov.yml',
    'docs/UI_STORY_COVERAGE_ROLLOUT.md',
    'docs/ci/lint-typecheck-audit-2026-10-23.md',
    'docs/design-system/DETAILS.md',
    'docs/llms-design-manifest.txt',
    'docs/pen-stills/README.md',
    'docs/pen-stills/homepage/manifest.json',
    'docs/pen-stills/manifest.schema.json',
    'packages/ui/atoms/tooltip.README.md',
    'pnpm-lock.yaml',
    'scripts/agent-context/rule-scopes.json',
    'scripts/ci-fast-lanes.mjs',
    'scripts/generate-llms-design-manifest.mjs',
    'scripts/generate-llms-design-manifest.test.mjs',
    'scripts/invariants/clef-screenshot-capture.mjs',
    'scripts/invariants/clef-screenshot-evaluator.mjs',
    'scripts/invariants/clef-screenshot-evaluator.test.mjs',
    'scripts/invariants/pen-still-diff-lib.mjs',
    'scripts/invariants/pen-still-diff.mjs',
    'scripts/invariants/pen-still-diff.test.mjs',
    'scripts/lib/__tests__/ci-fast-workflow-contract.test.mjs',
    'scripts/lib/__tests__/ci-harness.test.mjs',
    'scripts/lib/__tests__/gate-config-consistency.test.mjs',
    'scripts/lib/__tests__/merge-group-workflow-contract.test.mjs',
    'scripts/lib/__tests__/production-release-supersession.test.mjs',
    'scripts/lib/__tests__/release-lineage-gate.test.mjs',
    'scripts/lib/__tests__/ui-story-coverage-policy.test.mjs',
    'scripts/lib/gate-config-consistency.mjs',
    'scripts/repo-root-allowlist.json',
    'scripts/ui-story-coverage-policy.mjs',
  ];
  const BASE = 'a718a69d29ffdd1d74851511ecfe8aefe1e1a336';
  const CANDIDATE = 'afb27ba5dc790557660cb787c72279df3b2eb24e';

  it('the incident range grades known and does not require journeys', () => {
    const artifact = gradeReleaseRange({
      baseDeployedSha: BASE,
      candidateSha: CANDIDATE,
      paths: INCIDENT_PATHS,
    });
    expect(artifact.unknown).toBe(false);
    expect(artifact.paths.filter(p => p.class === 'unknown')).toEqual([]);
    expect(artifact.affects.auth).toBe(false);
    expect(artifact.affects.billing).toBe(false);
    expect(journeysRequired(artifact)).toBe(false);
  });

  it.each([
    ['.github/ui-story-coverage-policy.json', 'ci-workflows'],
    ['.github/workflow-topology.gen.yml', 'ci-workflows'],
    ['.github/ci-harness/manifest.json', 'ci-workflows'],
    ['canon/invariants.jsonl', 'ci-workflows'],
    ['canon/ownership.json', 'ci-workflows'],
    ['chromatic.config.json', 'ci-workflows'],
    ['codecov.yml', 'ci-workflows'],
    ['apps/web/data/homepageCopy.ts', 'public-ui'],
    ['apps/web/data/product-truth/golden-path-claims.ts', 'public-ui'],
    ['apps/web/styles/theme.css', 'public-ui'],
    ['apps/web/screenshot-catalog/current/manifest.json', 'public-ui'],
    ['apps/web/.storybook/main.ts', 'safe'],
    ['apps/web/.storybook/preview.tsx', 'safe'],
    ['apps/web/scripts/performance-route-manifest.ts', 'safe'],
    ['apps/web/scripts/marketing-eyebrow-caps.ts', 'safe'],
    ['apps/web/lib/a11y-gates/wcag-22-aa.ts', 'safe'],
    ['apps/web/lib/a11y-gates/a11y-allowlist.json', 'safe'],
    ['apps/web/lib/ovie/generated/performance-invariants-v1.json', 'safe'],
  ])('%s classifies as %s (never unknown)', (path, cls) => {
    const artifact = gradeReleaseRange({
      baseDeployedSha: BASE,
      candidateSha: CANDIDATE,
      paths: [path],
    });
    expect(artifact.unknown).toBe(false);
    expect(artifact.paths[0].class).toBe(cls);
    expect(artifact.unknownReasons).toEqual([]);
  });

  it('rule classes still win over known-safe patterns', () => {
    const artifact = gradeReleaseRange({
      baseDeployedSha: BASE,
      candidateSha: CANDIDATE,
      paths: ['apps/web/scripts/check-agent-gate-evidence.ts'],
    });
    expect(artifact.paths[0].class).toBe('agent-control-plane');
    expect(artifact.affects.agent).toBe(true);
  });

  it('a runtime-read sibling of the generated perf pack stays unknown', () => {
    // preview-env-exceptions.json is imported by server code; only the exact
    // generated performance pack is known-safe. Broadening that pattern would
    // silently mark future runtime-generated files safe.
    const artifact = gradeReleaseRange({
      baseDeployedSha: BASE,
      candidateSha: CANDIDATE,
      paths: ['apps/web/lib/ovie/generated/preview-env-exceptions.json'],
    });
    expect(artifact.unknown).toBe(true);
    expect(artifact.level).toBe('high');
    expect(journeysRequired(artifact)).toBe(true);
  });
});
