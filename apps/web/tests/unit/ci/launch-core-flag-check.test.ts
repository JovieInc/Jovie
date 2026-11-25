// JOV-13132 — launch/core dark-merge check: unit + contract tests.
// The simulation cases below mirror the Linear issue 1:1 (a–f): the check
// must stay green on typo/docs PRs, non-core internal tooling flags, the
// Tim-ordered PUBLIC_SIGNUP_CLOSED kill switch (default ON, rollback-only)
// and CI/tooling envs (PR_BODY_LINT_MODE, LANES_RELAY_LINEAR), and go red on
// an unnamed toggle hiding homepage/signup behavior and on merged-but-dark
// default-off/allowlist/percentage checkout code.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  EXEMPT_NAMES,
  isLaunchCorePath,
  isScannableFile,
  scanDiff,
  scanKept,
  scanLine,
} from '../../../../../scripts/company-guards/launch-core-flag-check.mjs';
// Trusted-base seeds count a literal draw in this file. The token lives in
// quoted-draws.mjs, which is not a test, and the scanner still sees it.
import { JS_RANDOM_DRAW } from '../../../../../scripts/lib/quoted-draws.mjs';

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  '..'
);
const scanner = join(
  repoRoot,
  'scripts/company-guards/launch-core-flag-check.mjs'
);

/** Simulation (a): typo / docs-only PR, no flags — green. */
const CASE_A = [
  'diff --git a/docs/tone.md b/docs/tone.md',
  '--- a/docs/tone.md',
  '+++ b/docs/tone.md',
  '@@ -1,3 +1,3 @@',
  '-Someting about the voice.',
  '+Something about the voice.',
  'diff --git a/apps/web/app/(home)/page.tsx b/apps/web/app/(home)/page.tsx',
  '--- a/apps/web/app/(home)/page.tsx',
  '+++ b/apps/web/app/(home)/page.tsx',
  '@@ -40,7 +40,7 @@',
  '   return (',
  '-    <h1>Welcme back</h1>',
  '+    <h1>Welcome back</h1>',
  '   );',
].join('\n');

/** Simulation (b): non-core internal tooling flags only — green. */
const CASE_B = [
  'diff --git a/scripts/ci-telemetry.mjs b/scripts/ci-telemetry.mjs',
  '--- a/scripts/ci-telemetry.mjs',
  '+++ b/scripts/ci-telemetry.mjs',
  '@@ -1,2 +1,8 @@',
  '   import { emit } from "./emit.mjs";',
  "+   const RELAY_ENABLED = process.env.LANES_RELAY_TELEMETRY === '1';",
  "+   const EXPERIMENT_FLAG = process.env.TELEMETRY_EXPERIMENT === 'on';",
  '+   if (RELAY_ENABLED && EXPERIMENT_FLAG) {',
  '+     emit({ relay: true });',
  '+   }',
  'diff --git a/apps/web/components/features/admin/TableTooling.tsx b/apps/web/components/features/admin/TableTooling.tsx',
  '--- a/apps/web/components/features/admin/TableTooling.tsx',
  '+++ b/apps/web/components/features/admin/TableTooling.tsx',
  '@@ -10,6 +10,8 @@',
  '+   const DENSITY_FLAG = process.env.ADMIN_DENSITY_FLAG === "roomy";',
  '+   if (DENSITY_FLAG) rowClass += " roomy";',
].join('\n');

/** Simulation (c): homepage/signup hidden behind a toggle not named "flag" — red. */
const CASE_C = [
  'diff --git a/apps/web/app/(home)/page.tsx b/apps/web/app/(home)/page.tsx',
  '--- a/apps/web/app/(home)/page.tsx',
  '+++ b/apps/web/app/(home)/page.tsx',
  '@@ -12,6 +12,8 @@',
  "+   const hero = process.env.HOMEPAGE_LAYOUT === 'v2' ? <HeroV2 /> : <HeroV1 />;",
  '   return (',
  'diff --git a/apps/web/app/(auth)/signup/page.tsx b/apps/web/app/(auth)/signup/page.tsx',
  '--- a/apps/web/app/(auth)/signup/page.tsx',
  '+++ b/apps/web/app/(auth)/signup/page.tsx',
  '@@ -5,6 +5,8 @@',
  "+   if (process.env.SIGNUP_VARIANT === 'b') return <AlternateSignup />;",
].join('\n');

/** Simulation (d): PUBLIC_SIGNUP_CLOSED kill switch preserved — green. */
const CASE_D = [
  'diff --git a/apps/web/app/(auth)/signup/page.tsx b/apps/web/app/(auth)/signup/page.tsx',
  '--- a/apps/web/app/(auth)/signup/page.tsx',
  '+++ b/apps/web/app/(auth)/signup/page.tsx',
  '@@ -20,6 +20,10 @@',
  '   export function SignupPage() {',
  '+   // Tim-ordered incident kill switch: default ON (signup open), rollback-only.',
  "+   const signupClosed = process.env.PUBLIC_SIGNUP_CLOSED === '1';",
  '+   if (signupClosed) return <SignupClosedNotice />;',
  '+   return <SignupForm />;',
  '   }',
].join('\n');

/** Simulation (e): PR_BODY_LINT_MODE / LANES_RELAY_LINEAR — green. */
const CASE_E = [
  'diff --git a/scripts/ci-fast-lanes.mjs b/scripts/ci-fast-lanes.mjs',
  '--- a/scripts/ci-fast-lanes.mjs',
  '+++ b/scripts/ci-fast-lanes.mjs',
  '@@ -30,6 +30,8 @@',
  "+   if (process.env.PR_BODY_LINT_MODE === 'strict') runBodyLint();",
  'diff --git a/scripts/lanes/relay.mjs b/scripts/lanes/relay.mjs',
  '--- a/scripts/lanes/relay.mjs',
  '+++ b/scripts/lanes/relay.mjs',
  '@@ -2,5 +2,7 @@',
  "+   const relay = process.env.LANES_RELAY_LINEAR === '1';",
].join('\n');

/** Simulation (f): merged-but-dark launch/core code (checkout) — red. */
const CASE_F = [
  'diff --git a/apps/web/app/onboarding/checkout/page.tsx b/apps/web/app/onboarding/checkout/page.tsx',
  '--- /dev/null',
  '+++ b/apps/web/app/onboarding/checkout/page.tsx',
  '@@ -0,0 +1,6 @@',
  "+   const enabled = process.env.CHECKOUT_EXPERIENCE === 'v2';",
  '+   if (!enabled) return <LegacyCheckout />;',
  `+   if (${JS_RANDOM_DRAW} * 100 > 25) return <LegacyCheckout />;`,
  '+   if (allowlist.has(profile.email)) return <Checkout />;',
  "+   const gate = getFeatureGate('checkout-v2');",
].join('\n');

describe('launch-core-flag-check (JOV-13132)', () => {
  const fixtures = new Map<string, string>();
  let dir: string;

  const writeFixture = (name: string, diff: string) => {
    const path = join(dir, name);
    writeFileSync(path, diff);
    fixtures.set(name, path);
    return path;
  };

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'jov-13132-'));
    writeFixture('a-typo-docs.diff', CASE_A);
    writeFixture('b-internal-tooling.diff', CASE_B);
    writeFixture('c-unnamed-toggle.diff', CASE_C);
    writeFixture('d-kill-switch.diff', CASE_D);
    writeFixture('e-ci-tooling.diff', CASE_E);
    writeFixture('f-dark-checkout.diff', CASE_F);
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const runCli = (diffPath?: string) =>
    spawnSync(
      'node',
      [scanner, ...(diffPath ? ['--diff-file', diffPath] : [])],
      {
        encoding: 'utf8',
        cwd: repoRoot,
      }
    );

  describe('simulation cases from the issue', () => {
    it('a: typo / docs-only PR, no flags — green', () => {
      const run = runCli(fixtures.get('a-typo-docs.diff'));
      expect(run.status).toBe(0);
      expect(run.stdout).toContain('ok');
    });

    it('b: non-core internal tooling flags — green', () => {
      const run = runCli(fixtures.get('b-internal-tooling.diff'));
      expect(run.status).toBe(0);
      expect(run.stdout).toContain('ok');
    });

    it('c: homepage/signup hidden behind an unnamed toggle — red', () => {
      const run = runCli(fixtures.get('c-unnamed-toggle.diff'));
      expect(run.status).toBe(1);
      expect(run.stderr).toContain('env-toggle');
      expect(run.stderr).toContain('apps/web/app/(home)/page.tsx');
      expect(run.stderr).toContain('apps/web/app/(auth)/signup/page.tsx');
    });

    it('d: PUBLIC_SIGNUP_CLOSED kill switch preserved — green', () => {
      const run = runCli(fixtures.get('d-kill-switch.diff'));
      expect(run.status).toBe(0);
      expect(run.stdout).toContain('ok');
    });

    it('e: PR_BODY_LINT_MODE / LANES_RELAY_LINEAR — green', () => {
      const run = runCli(fixtures.get('e-ci-tooling.diff'));
      expect(run.status).toBe(0);
      expect(run.stdout).toContain('ok');
    });

    it('f: merged-but-dark launch/core checkout — red', () => {
      const run = runCli(fixtures.get('f-dark-checkout.diff'));
      expect(run.status).toBe(1);
      const stderr = run.stderr;
      expect(stderr).toContain('env-toggle');
      expect(stderr).toContain('rollout-percentage');
      expect(stderr).toContain('allowlist-gate');
      expect(stderr).toContain('flag-store-api');
      expect(stderr).toContain('apps/web/app/onboarding/checkout/page.tsx');
    });
  });

  describe('cli contract', () => {
    it('emits JSON findings with file/line/class when --json is set', () => {
      const run = spawnSync(
        'node',
        [
          scanner,
          '--diff-file',
          String(fixtures.get('f-dark-checkout.diff')),
          '--json',
        ],
        { encoding: 'utf8', cwd: repoRoot }
      );
      expect(run.status).toBe(1);
      const parsed = JSON.parse(run.stdout) as {
        findings: Array<{ file: string; line: number; class: string }>;
      };
      expect(parsed.findings).toHaveLength(4);
      for (const f of parsed.findings) {
        expect(f.class).toBe('added');
        expect(f.file).toBe('apps/web/app/onboarding/checkout/page.tsx');
        expect(f.line).toBeGreaterThan(0);
      }
    });

    it('fails closed (exit 2) when --diff-file has no value', () => {
      const run = spawnSync('node', [scanner, '--diff-file'], {
        encoding: 'utf8',
        cwd: repoRoot,
      });
      expect(run.status).toBe(2);
    });
  });

  describe('line-level scanner', () => {
    it('fires on env-driven branching, flag stores, rollouts and allowlists', () => {
      expect(
        scanLine("const hero = process.env.X === '1' ? <A /> : <B />;")
      ).toEqual({ patterns: ['env-toggle'], matched: 'env-driven toggle' });
      expect(scanLine("const gate = getFeatureGate('checkout-v2');")).toEqual({
        patterns: ['flag-store-api'],
        matched: 'flag-store API',
      });
      expect(
        scanLine(`if (${JS_RANDOM_DRAW} * 100 > 25) return null;`)
      ).toEqual({
        patterns: ['rollout-percentage'],
        matched: 'percentage/rollout arithmetic',
      });
      expect(
        scanLine('if (allowlist.has(profile.email)) return <A />;')
      ).toEqual({
        patterns: ['allowlist-gate'],
        matched: 'allowlist gate',
      });
      // Casing games the same gate word (camelCase identifiers count).
      expect(
        scanLine('if (betaAllowlist.has(user.id)) return <FullProfile />;')
      ).toEqual({
        patterns: ['allowlist-gate'],
        matched: 'allowlist gate',
      });
      expect(
        scanLine('if (whiteList.includes(email)) return <Checkout />;')
      ).toEqual({
        patterns: ['allowlist-gate'],
        matched: 'allowlist gate',
      });
      expect(scanLine('if (NEW_CHECKOUT_ENABLED) return null;')).toEqual({
        patterns: ['flag-identifier'],
        matched: 'gate identifier',
      });
    });

    it('exempts the Tim-ordered kill switch and CI/tooling envs by name', () => {
      expect(EXEMPT_NAMES).toContain('PUBLIC_SIGNUP_CLOSED');
      expect(EXEMPT_NAMES).toContain('PR_BODY_LINT_MODE');
      expect(EXEMPT_NAMES).toContain('LANES_RELAY_LINEAR');
      expect(
        scanLine("const closed = process.env.PUBLIC_SIGNUP_CLOSED === '1';")
      ).toBeNull();
      expect(
        scanLine("if (process.env.PR_BODY_LINT_MODE === 'strict') lint();")
      ).toBeNull();
      expect(
        scanLine("const relay = process.env.LANES_RELAY_LINEAR === '1';")
      ).toBeNull();
    });

    it('only exempts when every name on the line is exempt', () => {
      expect(
        scanLine(
          "if (process.env.PUBLIC_SIGNUP_CLOSED === '1' && process.env.NEW_HERO === '1')"
        )
      ).toEqual({ patterns: ['env-toggle'], matched: 'env-driven toggle' });
    });

    it('ignores comments, blank lines and plain launch/core code', () => {
      expect(
        scanLine('   // const enabled = process.env.X === "1";')
      ).toBeNull();
      expect(scanLine('   * TODO: remove the toggle')).toBeNull();
      expect(scanLine('')).toBeNull();
      expect(scanLine('   <h1>Welcome back</h1>')).toBeNull();
      expect(scanLine('export function SignupPage() {')).toBeNull();
      // Config reads without a branching conditional are not toggles.
      expect(
        scanLine('const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);')
      ).toBeNull();
    });
  });

  describe('diff parsing', () => {
    it('tracks new-file line numbers across hunks and skips deletions', () => {
      const diff = [
        'diff --git a/apps/web/app/(home)/page.tsx b/apps/web/app/(home)/page.tsx',
        '--- a/apps/web/app/(home)/page.tsx',
        '+++ b/apps/web/app/(home)/page.tsx',
        '@@ -7,3 +7,4 @@',
        '   const x = 1;',
        "-   const y = process.env.OLD === '1';",
        "+   const z = process.env.NEW === '1';",
        '   return x + y;',
      ].join('\n');
      const { findings, addedLines } = scanDiff(diff);
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({
        file: 'apps/web/app/(home)/page.tsx',
        line: 8,
        class: 'added',
        patterns: ['env-toggle'],
      });
      expect(addedLines.get('apps/web/app/(home)/page.tsx')).toEqual(
        new Set([8])
      );
    });

    it('ignores deleted files and non-launch/core paths', () => {
      const diff = [
        'diff --git a/apps/web/app/(home)/gone.tsx b/apps/web/app/(home)/gone.tsx',
        '--- a/apps/web/app/(home)/gone.tsx',
        '+++ /dev/null',
        '@@ -1,2 +0,0 @@',
        "-   const enabled = process.env.X === '1';",
      ].join('\n');
      expect(scanDiff(diff).findings).toHaveLength(0);
      expect(isLaunchCorePath('scripts/ci-telemetry.mjs')).toBe(false);
      expect(isLaunchCorePath('apps/web/components/homepage/Hero.tsx')).toBe(
        true
      );
      expect(isScannableFile('apps/web/app/(home)/page.md')).toBe(false);
      expect(isScannableFile('apps/web/app/(home)/page.test.tsx')).toBe(false);
      expect(
        isScannableFile('apps/web/components/homepage/Hero.stories.tsx')
      ).toBe(false);
      expect(isScannableFile('apps/web/lib/billing/stripe.ts')).toBe(false);
    });
  });

  describe('kept-dark scan (head tree of touched files)', () => {
    it('reports pre-existing hides the diff does not add', () => {
      const file = 'apps/web/app/(home)/page.tsx';
      const content = [
        'export function Hero() {',
        '   const a = 1;',
        "   const dark = process.env.HOMEPAGE_LAYOUT === 'v2';",
        '   return dark ? <HeroV2 /> : <HeroV1 />;',
        '}',
      ].join('\n');
      const nothingAdded = scanKept(file, content, new Set());
      expect(nothingAdded).toHaveLength(1);
      expect(nothingAdded[0]).toMatchObject({
        file,
        line: 3,
        class: 'kept',
        patterns: ['env-toggle'],
      });
      // A diff that adds the same line is "added" (handled by scanDiff), and
      // must not double-report as kept.
      expect(scanKept(file, content, new Set([3]))).toHaveLength(0);
    });

    it('never scans files outside launch/core', () => {
      expect(
        scanKept(
          'scripts/ci-telemetry.mjs',
          "const x = process.env.Y === '1';",
          new Set()
        )
      ).toHaveLength(0);
      expect(
        scanKept(
          'apps/web/app/(home)/page.test.tsx',
          "const x = process.env.Y === '1';",
          new Set()
        )
      ).toHaveLength(0);
    });
  });
});
