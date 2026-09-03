import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LANE_COMMANDS, LANE_GROUPS } from '../../ci-fast-lanes.mjs';
import {
  CHECK_COMMAND,
  DESIGN_EXCEPTION_REGISTRIES,
  evaluateDesignExceptionRegistries,
  ISSUE_CODES,
} from '../../design-exception-registry.mjs';

const ROOT = resolve(import.meta.dirname, '../../..');
const BIN = resolve(ROOT, 'scripts/design-exception-registry.mjs');
const NOW = new Date('2026-08-29T12:00:00.000Z');
const DS = 'apps/web/tests/unit/design-system';
const ARBITRARY = `${DS}/arbitrary-values.baseline.json`;
const FAMILY = `${DS}/component-family.baseline.json`;
const BUTTONS = `${DS}/button-surface-classes-remaining.json`;
const FINDINGS = 'scripts/shared-ui-visual-arbitrary.baseline.json';
const SERIF = 'scripts/design-authority-exceptions.json';

const readJson = path => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));

function exception(overrides = {}) {
  return {
    path: 'apps/web/app/(home)/page.tsx',
    match: 'font-serif',
    kind: 'ugc',
    owner: '@jovie-design',
    reason: 'Registered UGC serif for a user-authored caption',
    issue: 'JOV-5447',
    expiresOn: '2027-01-01',
    evidence: 'docs/design-system/GOVERNANCE.md',
    ...overrides,
  };
}

function liveMaps() {
  /** @type {Record<string, unknown>} */
  const maps = {};
  for (const spec of DESIGN_EXCEPTION_REGISTRIES) {
    maps[spec.path] = readJson(spec.path);
  }
  return maps;
}

function evaluatePair(candidateOverrides = {}, drop = {}) {
  const base = liveMaps();
  const candidate = liveMaps();
  Object.assign(candidate, candidateOverrides);
  for (const path of drop.base ?? []) delete base[path];
  for (const path of drop.candidate ?? []) delete candidate[path];
  /** @param {Record<string, unknown>} store @param {string} path */
  const read = (store, path) =>
    Object.hasOwn(store, path)
      ? { missing: false, value: store[path] }
      : { missing: true };
  return evaluateDesignExceptionRegistries({
    repoRoot: ROOT,
    now: NOW,
    readCandidate: path => read(candidate, path),
    readBase: (_ref, path) => read(base, path),
    resolveTrustedBase: () =>
      /** @type {{ ok: true, ref: string }} */ ({
        ok: true,
        ref: 'origin/main',
      }),
  });
}

describe('design exception-registry contract (JOV-5447)', () => {
  it('fails closed for every required rejection', () => {
    expect(LANE_GROUPS.remaining).toContain('design-exception-registry');
    expect(CHECK_COMMAND).not.toMatch(/vitest|playwright|e2e/i);
    const family = readJson(FAMILY);
    const findings = readJson(FINDINGS);
    const arbitrary = readJson(ARBITRARY);
    const undocumented = {
      [SERIF]: { serif: [{ path: 'apps/web/app/page.tsx', match: 'Georgia' }] },
    };
    /** @type {[string, Record<string, unknown>?, { base?: string[], candidate?: string[] }?][]} */
    const cases = [
      [
        ISSUE_CODES.MISSING_REGISTRY,
        {},
        { base: [ARBITRARY], candidate: [ARBITRARY] },
      ],
      [ISSUE_CODES.SELF_SEEDED_REGISTRY, {}, { base: [ARBITRARY] }],
      [
        ISSUE_CODES.COUNT_GROWTH,
        { [ARBITRARY]: { ...arbitrary, count: arbitrary.count + 1 } },
      ],
      [
        ISSUE_CODES.SET_GROWTH,
        { [BUTTONS]: { maxRemaining: 0, remaining: ['system-b-chat-button'] } },
      ],
      [
        ISSUE_CODES.PATH_GROWTH,
        {
          [FAMILY]: {
            ...family,
            allowedEmptyStatePaths: [
              ...family.allowedEmptyStatePaths,
              'components/features/new/NewEmptyState.tsx',
            ],
          },
        },
      ],
      [
        ISSUE_CODES.VALUE_GROWTH,
        {
          [FINDINGS]: {
            ...findings,
            findings: [
              ...findings.findings,
              {
                file: 'packages/ui/atoms/badge.tsx',
                value: 'w-[327px]',
                count: 1,
              },
            ],
          },
        },
      ],
      [ISSUE_CODES.MISSING_EXCEPTION_METADATA, undocumented],
      [ISSUE_CODES.EVIDENCE_FREE_EXCEPTION, undocumented],
      [
        ISSUE_CODES.EXPIRED_EXCEPTION,
        { [SERIF]: { serif: [exception({ expiresOn: '2026-01-01' })] } },
      ],
    ];
    const missingBase = evaluateDesignExceptionRegistries({
      repoRoot: ROOT,
      now: NOW,
      resolveTrustedBase: () => ({
        ok: false,
        ref: null,
        detail: 'trusted base is missing',
      }),
    });
    expect(missingBase.issues.map(item => item.code)).toContain(
      ISSUE_CODES.MISSING_TRUSTED_BASE
    );
    for (const [code, overrides, drop] of cases) {
      const result = evaluatePair(overrides, drop);
      expect(result.ok, code).toBe(false);
      expect(
        result.issues.map(item => item.code),
        code
      ).toContain(code);
    }
  });

  it('passes shrink, unchanged, and complete documented exceptions', () => {
    expect(evaluatePair().ok).toBe(true);
    const arbitrary = readJson(ARBITRARY);
    expect(evaluatePair({ [ARBITRARY]: { ...arbitrary, count: 0 } }).ok).toBe(
      true
    );
    const added = evaluatePair({ [SERIF]: { serif: [exception()] } });
    expect(added.ok, added.issues.map(item => item.detail).join('\n')).toBe(
      true
    );
  });
});

describe('design exception-registry native ci-fast gate (JOV-5447)', () => {
  it('propagates a validator failure as a nonzero native gate result', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'design-exception-registry-'));
    const git = args =>
      spawnSync('git', args, { cwd: fixture, encoding: 'utf8' });
    try {
      git(['init', '-b', 'main']);
      git(['config', 'user.email', 'jovie-agent@example.com']);
      git(['config', 'user.name', 'Jovie Agent']);
      for (const spec of DESIGN_EXCEPTION_REGISTRIES) {
        const dest = join(fixture, spec.path);
        mkdirSync(dirname(dest), { recursive: true });
        copyFileSync(resolve(ROOT, spec.path), dest);
      }
      git(['add', '-A']);
      git(['commit', '-m', 'base']);
      const baseSha = git(['rev-parse', 'HEAD']).stdout.trim();
      const live = readJson(ARBITRARY);
      writeFileSync(
        join(fixture, ARBITRARY),
        `${JSON.stringify({ ...live, count: live.count + 5 })}\n`
      );
      git(['add', '-A']);
      git(['commit', '-m', 'raise']);
      git(['update-ref', 'refs/remotes/origin/main', baseSha]);
      const cli = spawnSync(process.execPath, [BIN], {
        cwd: ROOT,
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_EVENT_NAME: 'pull_request',
          GITHUB_BASE_REF: 'main',
          DESIGN_EXCEPTION_REGISTRY_ROOT: fixture,
        },
      });
      expect(cli.status).not.toBe(0);
      expect(`${cli.stdout}${cli.stderr}`).toMatch(/count-growth|FAIL/);
      expect(LANE_COMMANDS['design-exception-registry']).toBe(CHECK_COMMAND);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});
