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
  ARBITRARY_BASELINE_RELATIVE,
  ARBITRARY_SCAN_DIRS,
  ARBITRARY_VALUE_PATTERN,
  CHECK_COMMAND,
  countArbitraryValues,
  countLinearNamespaceUsage,
  evaluateDesignSystemSourceRatchet,
  LINEAR_BASELINE_RELATIVE,
  LINEAR_NAMESPACE_PATTERN,
  LINEAR_SCAN_DIRS,
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

function writeBaseline(repoRoot, relativePath, count) {
  const fullPath = join(repoRoot, relativePath);
  mkdirSync(join(fullPath, '..'), { recursive: true });
  writeFileSync(fullPath, `${JSON.stringify({ count }, null, 2)}\n`);
}

function makeFixture() {
  const repoRoot = mkdtempSync(join(tmpdir(), 'design-system-source-ratchet-'));
  const webRoot = join(repoRoot, 'apps/web');
  mkdirSync(join(webRoot, 'app'), { recursive: true });
  mkdirSync(join(webRoot, 'components'), { recursive: true });
  mkdirSync(join(webRoot, 'styles'), { recursive: true });
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
  return { repoRoot, webRoot };
}

describe('design-system source count ratchet (JOV-5301)', () => {
  it('is a cheap remaining-group filesystem scan, not unit/e2e', () => {
    expect(LANE_GROUPS.remaining).toContain('design-system-source-ratchet');
    expect(LANE_COMMANDS['design-system-source-ratchet']).toBe(CHECK_COMMAND);
    expect(PACKAGE_JSON.scripts['design:source-count-ratchet']).toBe(
      'node scripts/design-system-source-ratchet.mjs'
    );
    expect(CHECK_COMMAND).not.toMatch(/vitest|playwright|e2e/i);
  });

  it('locks counters and scan roots to the unit-test ratchets', () => {
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

  it('fails closed on growth and allows unbaselined shrink', () => {
    const { repoRoot, webRoot } = makeFixture();
    try {
      writeBaseline(repoRoot, ARBITRARY_BASELINE_RELATIVE, 2);
      writeBaseline(repoRoot, LINEAR_BASELINE_RELATIVE, 3);
      expect(countArbitraryValues(webRoot)).toBe(2);
      expect(countLinearNamespaceUsage(webRoot).count).toBe(3);
      expect(evaluateDesignSystemSourceRatchet({ repoRoot, webRoot }).ok).toBe(
        true
      );

      writeFileSync(
        join(webRoot, 'app', 'page.tsx'),
        'export const classes = "w-[12px] text-[#fff] h-[42rem]";\n'
      );
      writeFileSync(
        join(webRoot, 'styles', 'tokens.css'),
        ':root { --linear-text-primary: #fff; --linear-border: #000; --linear-extra: 1; }\n'
      );
      const growth = evaluateDesignSystemSourceRatchet({ repoRoot, webRoot });
      expect(growth.ok).toBe(false);
      expect(growth.issues.join('\n')).toMatch(
        /arbitrary Tailwind values grew: 3 > baseline 2/
      );
      expect(growth.issues.join('\n')).toMatch(
        /--linear-\* usage grew: 4 > baseline 3/
      );

      writeFileSync(
        join(webRoot, 'app', 'page.tsx'),
        'export const classes = "w-full";\n'
      );
      writeFileSync(
        join(webRoot, 'styles', 'tokens.css'),
        ':root { --linear-text-primary: #fff; }\n'
      );
      const shrink = evaluateDesignSystemSourceRatchet({ repoRoot, webRoot });
      expect(shrink.ok).toBe(true);
      expect(shrink.metrics.map(metric => metric.count)).toEqual([0, 2]);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('passes the live apps/web tree against committed baselines', () => {
    const started = Date.now();
    const result = evaluateDesignSystemSourceRatchet({ repoRoot: REPO_ROOT });
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(result.ok, result.issues.join('\n')).toBe(true);
    expect(
      result.metrics.every(metric => metric.count <= metric.baseline)
    ).toBe(true);
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
