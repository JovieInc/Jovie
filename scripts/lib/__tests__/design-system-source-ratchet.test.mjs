import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LANE_COMMANDS, LANE_GROUPS } from '../../ci-fast-lanes.mjs';
import {
  ARBITRARY_SCAN_DIRS,
  ARBITRARY_VALUE_PATTERN,
  CHECK_COMMAND,
  collectDesignSystemIdentities,
  countArbitraryValues,
  countLinearNamespaceUsage,
  evaluateDesignSystemSourceRatchet,
  IDENTITY_ALLOWLIST_RELATIVE,
  IDENTITY_BASELINE_RELATIVE,
  IDENTITY_SCAN_ROOTS,
  IDENTITY_SCHEMA,
  identityKey,
  LINEAR_NAMESPACE_PATTERN,
  LINEAR_SCAN_DIRS,
  writeIdentityBaseline,
} from '../../design-system-source-ratchet.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const PACKAGE_JSON = JSON.parse(
  readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8')
);
const ARBITRARY_TEST = readFileSync(
  resolve(
    REPO_ROOT,
    'apps/web/tests/unit/design-system/arbitrary-values-ratchet.test.ts'
  ),
  'utf8'
);
const LINEAR_TEST = readFileSync(
  resolve(
    REPO_ROOT,
    'apps/web/tests/unit/design-system/linear-namespace-ratchet.test.ts'
  ),
  'utf8'
);

function writeJson(repoRoot, relativePath, value) {
  const fullPath = join(repoRoot, relativePath);
  mkdirSync(join(fullPath, '..'), { recursive: true });
  writeFileSync(fullPath, `${JSON.stringify(value, null, 2)}\n`);
}

function makeFixture() {
  const repoRoot = mkdtempSync(join(tmpdir(), 'design-system-source-ratchet-'));
  const webRoot = join(repoRoot, 'apps/web');
  mkdirSync(join(webRoot, 'app'), { recursive: true });
  mkdirSync(join(webRoot, 'components'), { recursive: true });
  mkdirSync(join(webRoot, 'styles'), { recursive: true });
  mkdirSync(join(webRoot, 'lib'), { recursive: true });
  mkdirSync(join(repoRoot, 'packages/ui'), { recursive: true });
  writeFileSync(
    join(webRoot, 'app', 'page.tsx'),
    'export const classes = "w-[12px] text-[#fff]";\n'
  );
  writeFileSync(
    join(webRoot, 'components', 'clean.ts'),
    'export const className = "w-full";\n'
  );
  writeFileSync(
    join(webRoot, 'styles', 'tokens.css'),
    ':root { --linear-text-primary: #fff; --linear-border: #000; }\n'
  );
  writeFileSync(
    join(webRoot, 'tailwind.config.js'),
    'module.exports = { theme: { colors: { brand: "var(--linear-brand)" } } };\n'
  );
  writeJson(repoRoot, IDENTITY_ALLOWLIST_RELATIVE, {
    schema: IDENTITY_SCHEMA,
    identities: [],
  });
  return { repoRoot, webRoot };
}

function seedBaseline(repoRoot) {
  writeIdentityBaseline({ repoRoot });
}

describe('design-system source identity ratchet (JOV-5301)', () => {
  it('is a cheap remaining-group filesystem scan, not unit/e2e', () => {
    expect(LANE_GROUPS.remaining).toContain('design-system-source-ratchet');
    expect(LANE_COMMANDS['design-system-source-ratchet']).toBe(CHECK_COMMAND);
    expect(PACKAGE_JSON.scripts['design:source-count-ratchet']).toBe(
      'node scripts/design-system-source-ratchet.mjs'
    );
    expect(CHECK_COMMAND).not.toMatch(/vitest|playwright|e2e/i);
  });

  it('keeps count helpers locked to the unit-test ratchets', () => {
    expect(ARBITRARY_TEST).toContain(
      `const ARBITRARY = ${ARBITRARY_VALUE_PATTERN.toString()};`
    );
    expect(ARBITRARY_TEST).toContain(
      "const SCAN_DIRS = ['components', 'app'] as const;"
    );
    expect([...ARBITRARY_SCAN_DIRS]).toEqual(['components', 'app']);
    expect(LINEAR_TEST).toContain(
      `const LINEAR_VAR = ${LINEAR_NAMESPACE_PATTERN.toString()};`
    );
    expect(LINEAR_TEST).toContain(
      "for (const dir of ['app', 'components', 'styles'])"
    );
    expect([...LINEAR_SCAN_DIRS]).toEqual(['app', 'components', 'styles']);
  });

  it('widens identity scan roots beyond the count-only unit-test dirs', () => {
    const roots = IDENTITY_SCAN_ROOTS.map(root => root.repoRelative);
    expect(roots).toEqual([
      'apps/web/app',
      'apps/web/components',
      'apps/web/styles',
      'apps/web/lib',
      'packages/ui',
    ]);
  });

  it('fails closed on new identities and allows unbaselined shrink', () => {
    const { repoRoot, webRoot } = makeFixture();
    try {
      seedBaseline(repoRoot);
      expect(countArbitraryValues(webRoot)).toBe(2);
      expect(countLinearNamespaceUsage(webRoot).count).toBe(3);
      expect(evaluateDesignSystemSourceRatchet({ repoRoot }).ok).toBe(true);

      writeFileSync(
        join(webRoot, 'app', 'page.tsx'),
        'export const classes = "w-[12px] text-[#fff] h-[42rem]";\n'
      );
      writeFileSync(
        join(webRoot, 'styles', 'tokens.css'),
        ':root { --linear-text-primary: #fff; --linear-border: #000; --linear-extra: 1; }\n'
      );
      const growth = evaluateDesignSystemSourceRatchet({ repoRoot });
      expect(growth.ok).toBe(false);
      expect(growth.issues.join('\n')).toMatch(
        /new arbitrary-value identity in apps\/web\/app\/page\.tsx: h-\[42rem\]/
      );
      expect(growth.issues.join('\n')).toMatch(
        /new linear-namespace identity in apps\/web\/styles\/tokens\.css: --linear-extra/
      );

      writeFileSync(
        join(webRoot, 'app', 'page.tsx'),
        'export const classes = "w-full";\n'
      );
      writeFileSync(
        join(webRoot, 'styles', 'tokens.css'),
        ':root { --linear-text-primary: #fff; }\n'
      );
      const shrink = evaluateDesignSystemSourceRatchet({ repoRoot });
      expect(shrink.ok).toBe(true);
      expect(shrink.newIdentities).toEqual([]);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('catches count-only escapes: arbitrary properties and styles/lib/ui roots', () => {
    const { repoRoot, webRoot } = makeFixture();
    try {
      seedBaseline(repoRoot);
      const beforeCount = countArbitraryValues(webRoot);
      writeFileSync(
        join(webRoot, 'styles', 'escape.css'),
        '.hero { @apply [width:327px]; }\n'
      );
      writeFileSync(
        join(webRoot, 'lib', 'layout.ts'),
        'export const wide = "[height:99px]";\n'
      );
      writeFileSync(
        join(repoRoot, 'packages/ui', 'chip.tsx'),
        'export const chip = "w-[99px]";\n'
      );

      expect(countArbitraryValues(webRoot)).toBe(beforeCount);
      const result = evaluateDesignSystemSourceRatchet({ repoRoot });
      expect(result.ok).toBe(false);
      expect(result.issues.join('\n')).toMatch(
        /new arbitrary-property identity in apps\/web\/styles\/escape\.css: \[width:327px\]/
      );
      expect(result.issues.join('\n')).toMatch(
        /new arbitrary-property identity in apps\/web\/lib\/layout\.ts: \[height:99px\]/
      );
      expect(result.issues.join('\n')).toMatch(
        /new arbitrary-value identity in packages\/ui\/chip\.tsx: w-\[99px\]/
      );
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('honors documented allowlist identities', () => {
    const { repoRoot, webRoot } = makeFixture();
    try {
      seedBaseline(repoRoot);
      writeFileSync(
        join(webRoot, 'styles', 'escape.css'),
        '.hero { @apply [width:327px]; }\n'
      );
      writeJson(repoRoot, IDENTITY_ALLOWLIST_RELATIVE, {
        schema: IDENTITY_SCHEMA,
        identities: [
          identityKey(
            'apps/web/styles/escape.css',
            'arbitrary-property',
            '[width:327px]'
          ),
        ],
      });
      expect(evaluateDesignSystemSourceRatchet({ repoRoot }).ok).toBe(true);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('keeps the committed identity baseline compact for the source-PR size cap', () => {
    const baseline = readFileSync(
      resolve(REPO_ROOT, IDENTITY_BASELINE_RELATIVE),
      'utf8'
    );
    const lines = baseline.split('\n').length;
    expect(lines, `baseline is ${lines} lines`).toBeLessThanOrEqual(3);
    const parsed = JSON.parse(baseline);
    expect(parsed.schema).toBe(IDENTITY_SCHEMA);
    expect(Array.isArray(parsed.identities)).toBe(true);
    expect(parsed.identities).toHaveLength(parsed.count);
    const biome = JSON.parse(
      readFileSync(resolve(REPO_ROOT, 'biome.json'), 'utf8')
    );
    expect(biome.files.includes).toContain(`!${IDENTITY_BASELINE_RELATIVE}`);
  });

  it('passes the live tree against the committed identity baseline', () => {
    const started = Date.now();
    const result = evaluateDesignSystemSourceRatchet({ repoRoot: REPO_ROOT });
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(result.ok, result.issues.join('\n')).toBe(true);
    expect(result.newIdentities).toEqual([]);
    expect(collectDesignSystemIdentities({ repoRoot: REPO_ROOT }).length).toBe(
      result.identities.length
    );
  });

  it('exits zero from the CLI on the live tree', () => {
    const result = spawnSync(
      process.execPath,
      [resolve(REPO_ROOT, 'scripts/design-system-source-ratchet.mjs')],
      { cwd: REPO_ROOT, encoding: 'utf8' }
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/PASS/);
  });
});
