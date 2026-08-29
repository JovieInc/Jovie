import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
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
  executeDesignSystemSourceRatchetLane,
  LANE_COMMANDS,
  LANE_GROUPS,
} from '../../ci-fast-lanes.mjs';
import {
  ARBITRARY_BASELINE_RELATIVE,
  ARBITRARY_SCAN_DIRS,
  ARBITRARY_VALUE_PATTERN,
  CHECK_COMMAND,
  countArbitraryValues,
  countDesignSystemSourceMetrics,
  countLinearNamespaceUsage,
  DESIGN_DEBT_INVENTORY_RELATIVE,
  DESIGN_DEBT_REGISTRIES,
  DESIGN_DEBT_REGISTRY_SCHEMA,
  evaluateDesignDebtRegistries,
  evaluateDesignSystemSourceRatchet,
  LINEAR_BASELINE_RELATIVE,
  LINEAR_NAMESPACE_PATTERN,
  LINEAR_SCAN_DIRS,
  resolveTrustedBaseCommit,
  resolveTrustedBaseRef,
  validateDesignDebtRegistryInventory,
} from '../../design-system-source-ratchet.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const PACKAGE_JSON = JSON.parse(
  readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8')
);
const INVENTORY_BOOTSTRAP_BASE = spawnSync(
  'git',
  ['log', '-1', '--format=%H', '--', DESIGN_DEBT_INVENTORY_RELATIVE],
  { cwd: REPO_ROOT, encoding: 'utf8' }
).stdout.trim();
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
const EXPECTED_DEBT_REGISTRY_IDS = [
  'web-arbitrary-values',
  'web-linear-namespace',
  'component-family-counts',
  'component-family-empty-state-paths',
  'button-surface-class-ceiling',
  'button-surface-class-paths',
  'web-raw-buttons',
  'shared-layer-server-imports',
  'sidebar-nav-row',
  'sidebar-nav-row-allowlist',
  'destructive-dialog-allowlist',
  'contrast-raw-color-counts',
  'touch-target-count',
  'shared-ui-visual-arbitrary',
  'serif-authority-exceptions',
  'story-coverage-floors',
  'design-conformance-unbound-components',
];

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

function copyIntoFixture(repoRoot, relativePath) {
  const destination = join(repoRoot, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(join(REPO_ROOT, relativePath), destination);
}

function makeDebtRegistryFixture() {
  const repoRoot = mkdtempSync(join(tmpdir(), 'design-debt-registry-'));
  const copied = new Set();
  copyIntoFixture(repoRoot, DESIGN_DEBT_INVENTORY_RELATIVE);
  for (const entry of DESIGN_DEBT_REGISTRIES) {
    for (const path of [entry.path, ...entry.evidence]) {
      if (copied.has(path)) continue;
      copyIntoFixture(repoRoot, path);
      copied.add(path);
    }
  }
  const baseFiles = new Map(
    [
      DESIGN_DEBT_INVENTORY_RELATIVE,
      ...DESIGN_DEBT_REGISTRIES.map(entry => entry.path),
    ].map(path => [path, readFileSync(join(repoRoot, path), 'utf8')])
  );
  return { repoRoot, baseFiles };
}

function writeRegistry(repoRoot, relativePath, mutate) {
  const path = join(repoRoot, relativePath);
  const value = JSON.parse(readFileSync(path, 'utf8'));
  mutate(value);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function addTypescriptSetValue(repoRoot, relativePath, binding, value) {
  const path = join(repoRoot, relativePath);
  const source = readFileSync(path, 'utf8');
  const marker = `const ${binding} = new Set([`;
  expect(source).toContain(marker);
  writeFileSync(path, source.replace(marker, `${marker}\n  '${value}',`));
}

function emptyTypescriptSet(repoRoot, relativePath, binding) {
  const path = join(repoRoot, relativePath);
  const source = readFileSync(path, 'utf8');
  const escapedBinding = binding.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const declaration = new RegExp(
    `const\\s+${escapedBinding}\\s*=\\s*new\\s+Set\\s*\\(\\s*\\[[\\s\\S]*?\\]\\s*\\)`
  );
  expect(source).toMatch(declaration);
  writeFileSync(
    path,
    source.replace(declaration, `const ${binding} = new Set([])`)
  );
}

function withEnvironment(patch, callback) {
  const previous = new Map();
  for (const [key, value] of Object.entries(patch)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return callback();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function commitFixture(repoRoot) {
  const commands = [
    ['init', '-q'],
    ['config', 'user.email', 'ratchet@example.test'],
    ['config', 'user.name', 'Ratchet Fixture'],
    ['add', '.'],
    ['commit', '-qm', 'trusted base'],
    ['rev-parse', 'HEAD'],
  ];
  let sha = '';
  for (const args of commands) {
    const result = spawnSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    expect(result.status, result.stderr).toBe(0);
    if (args[0] === 'rev-parse') sha = result.stdout.trim();
  }
  return sha;
}

function expectRegistryRegression(relativePath, mutate, pattern) {
  const { repoRoot, baseFiles } = makeDebtRegistryFixture();
  try {
    writeRegistry(repoRoot, relativePath, mutate);
    const result = evaluateDesignDebtRegistries({
      repoRoot,
      trustedBaseRef: 'fixture-base',
      readBaseFile: path => {
        const value = baseFiles.get(path);
        if (value === undefined)
          throw new Error(`missing fixture base ${path}`);
        return value;
      },
    });
    expect(result.ok).toBe(false);
    expect(result.issues.join('\n')).toMatch(pattern);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
}

describe('trusted-base design debt registry inventory (JOV-5447)', () => {
  it('is machine-readable, evidence-referenced, and emits a scalable receipt', () => {
    const { repoRoot, baseFiles } = makeDebtRegistryFixture();
    try {
      expect(
        validateDesignDebtRegistryInventory(DESIGN_DEBT_REGISTRIES, {
          repoRoot,
        })
      ).toEqual([]);
      expect(DESIGN_DEBT_REGISTRIES.map(entry => entry.id)).toEqual(
        EXPECTED_DEBT_REGISTRY_IDS
      );
      const result = evaluateDesignDebtRegistries({
        repoRoot,
        trustedBaseRef: 'fixture-base',
        readBaseFile: path => baseFiles.get(path),
      });
      expect(result).toMatchObject({
        ok: true,
        schema: DESIGN_DEBT_REGISTRY_SCHEMA,
        trustedBaseRef: 'fixture-base',
        inventoryCount: DESIGN_DEBT_REGISTRIES.length,
      });
      expect(result.registries).toHaveLength(DESIGN_DEBT_REGISTRIES.length);
      expect(result.registries.every(item => item.status === 'unchanged')).toBe(
        true
      );

      const strengthened = DESIGN_DEBT_REGISTRIES.map((entry, index) =>
        index === 0
          ? { ...entry, reason: `${entry.reason} Evidence reviewed.` }
          : entry
      );
      expect(
        evaluateDesignDebtRegistries({
          repoRoot,
          entries: strengthened,
          trustedBaseRef: 'fixture-base',
          readBaseFile: path => baseFiles.get(path),
        }).ok
      ).toBe(true);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('fails closed when the trusted base or a required registry is missing', () => {
    const { repoRoot, baseFiles } = makeDebtRegistryFixture();
    try {
      const missingBase = evaluateDesignDebtRegistries({
        repoRoot,
        trustedBaseRef: 'refs/heads/does-not-exist',
      });
      expect(missingBase.ok).toBe(false);
      expect(missingBase.issues.join('\n')).toMatch(
        /trusted base .* unavailable/
      );

      const missingBaseRegistry = evaluateDesignDebtRegistries({
        repoRoot,
        trustedBaseRef: 'fixture-base',
        readBaseFile: path => {
          if (path === ARBITRARY_BASELINE_RELATIVE) {
            throw new Error(
              `required registry ${path} is missing from trusted base fixture-base`
            );
          }
          return baseFiles.get(path);
        },
      });
      expect(missingBaseRegistry.ok).toBe(false);
      expect(missingBaseRegistry.issues.join('\n')).toMatch(
        /required registry .* is missing from trusted base/
      );

      rmSync(join(repoRoot, ARBITRARY_BASELINE_RELATIVE));
      const missingRegistry = evaluateDesignDebtRegistries({
        repoRoot,
        trustedBaseRef: 'fixture-base',
        readBaseFile: path => baseFiles.get(path),
      });
      expect(missingRegistry.ok).toBe(false);
      expect(missingRegistry.issues.join('\n')).toMatch(
        /required candidate registry is missing/
      );
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('selects PR, merge-group, and local trusted bases with TURBO precedence', () => {
    expect(
      resolveTrustedBaseRef({
        TURBO_SCM_BASE: 'merge-group-base-sha',
        GITHUB_BASE_REF: 'release',
      })
    ).toBe('merge-group-base-sha');
    expect(resolveTrustedBaseRef({ GITHUB_BASE_REF: 'release' })).toBe(
      'origin/release'
    );
    expect(resolveTrustedBaseRef({})).toBe('origin/main');
  });

  it('allows only the local merge-base fallback for diverged history', () => {
    const { repoRoot } = makeDebtRegistryFixture();
    try {
      const base = commitFixture(repoRoot);
      const tree = spawnSync('git', ['rev-parse', 'HEAD^{tree}'], {
        cwd: repoRoot,
        encoding: 'utf8',
      }).stdout.trim();
      const sibling = spawnSync('git', ['commit-tree', tree, '-p', base], {
        cwd: repoRoot,
        encoding: 'utf8',
        input: 'sibling base\n',
      });
      expect(sibling.status, sibling.stderr).toBe(0);
      const siblingSha = sibling.stdout.trim();
      expect(
        spawnSync(
          'git',
          ['update-ref', 'refs/remotes/origin/main', siblingSha],
          { cwd: repoRoot, encoding: 'utf8' }
        ).status
      ).toBe(0);

      expect(resolveTrustedBaseCommit(repoRoot, base, false)).toBe(base);
      expect(resolveTrustedBaseCommit(repoRoot, 'origin/main', true)).toBe(
        base
      );
      expect(() =>
        resolveTrustedBaseCommit(repoRoot, 'origin/main', false)
      ).toThrow(/not an ancestor of HEAD/);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('rejects same-PR count, map, path, and value ceiling growth', () => {
    expectRegistryRegression(
      ARBITRARY_BASELINE_RELATIVE,
      registry => {
        registry.count += 1;
      },
      /candidate ceiling grew .* same-PR raises are forbidden/
    );
    expectRegistryRegression(
      'apps/web/tests/unit/design-system/component-family.baseline.json',
      registry => {
        registry.counts.button += 1;
      },
      /component-family-counts.*button: candidate ceiling grew/s
    );
    expectRegistryRegression(
      'apps/web/tests/unit/design-system/component-family.baseline.json',
      registry => {
        registry.allowedEmptyStatePaths.push(
          'components/features/new/NewFeatureEmptyState.tsx'
        );
        registry.allowedEmptyStatePaths.sort();
      },
      /candidate added exception .* same-PR path\/value growth is forbidden/
    );
    expectRegistryRegression(
      'scripts/shared-ui-visual-arbitrary.baseline.json',
      registry => {
        registry.findings[0].count += 1;
        registry.totalFindings += 1;
      },
      /candidate finding grew .* same-PR path\/value growth is forbidden/
    );
    expectRegistryRegression(
      'apps/web/tests/unit/design-system/button-surface-classes-remaining.json',
      registry => {
        registry.maxRemaining += 1;
      },
      /button-surface-class-ceiling.*candidate ceiling grew/s
    );
    expectRegistryRegression(
      'apps/web/tests/unit/design-system/button-surface-classes-remaining.json',
      registry => {
        registry.remaining.push('system-b-new-button');
      },
      /button-surface-class-paths.*candidate added exception/s
    );
    expectRegistryRegression(
      'scripts/story-coverage-baseline.json',
      registry => {
        registry.roots['apps/web/components/molecules'].uncovered += 1;
      },
      /story-coverage-floors.*candidate uncovered ceiling grew/s
    );
    expectRegistryRegression(
      'scripts/story-coverage-baseline.json',
      registry => {
        registry.roots['apps/web/components/molecules'].percent -= 1;
      },
      /story-coverage-floors.*candidate coverage floor fell/s
    );
  });

  it('rejects code-embedded path allowlist growth', () => {
    const cases = [
      {
        path: 'apps/web/tests/unit/design-system/sidebar-nav-row-ratchet.test.ts',
        binding: 'ALLOWLIST',
        value: 'components/features/new/NewSidebarRow.tsx',
        expected: /sidebar-nav-row-allowlist.*candidate added exception/s,
      },
      {
        path: 'apps/web/tests/unit/design-system/destructive-confirm-dialog-audit.test.ts',
        binding: 'DIRECT_DESTRUCTIVE_ALERT_DIALOG_ALLOWLIST',
        value: 'components/features/new/NewDestructiveDialog.tsx',
        expected: /destructive-dialog-allowlist.*candidate added exception/s,
      },
    ];
    for (const item of cases) {
      const { repoRoot, baseFiles } = makeDebtRegistryFixture();
      try {
        addTypescriptSetValue(repoRoot, item.path, item.binding, item.value);
        const result = evaluateDesignDebtRegistries({
          repoRoot,
          trustedBaseRef: 'fixture-base',
          readBaseFile: path => baseFiles.get(path),
        });
        expect(result.ok).toBe(false);
        expect(result.issues.join('\n')).toMatch(item.expected);
      } finally {
        rmSync(repoRoot, { recursive: true, force: true });
      }
    }
  });

  it('allows code-embedded allowlists to tighten to empty', () => {
    const { repoRoot, baseFiles } = makeDebtRegistryFixture();
    try {
      emptyTypescriptSet(
        repoRoot,
        'apps/web/tests/unit/design-system/sidebar-nav-row-ratchet.test.ts',
        'ALLOWLIST'
      );
      emptyTypescriptSet(
        repoRoot,
        'apps/web/tests/unit/design-system/destructive-confirm-dialog-audit.test.ts',
        'DIRECT_DESTRUCTIVE_ALERT_DIALOG_ALLOWLIST'
      );
      const result = evaluateDesignDebtRegistries({
        repoRoot,
        trustedBaseRef: 'fixture-base',
        readBaseFile: path => baseFiles.get(path),
      });
      expect(result.ok, result.issues.join('\n')).toBe(true);
      expect(
        result.registries
          .filter(item => item.status === 'ceiling-lowered')
          .map(item => item.id)
      ).toEqual(['sidebar-nav-row-allowlist', 'destructive-dialog-allowlist']);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('rejects dynamic code-embedded allowlist declarations', () => {
    const { repoRoot, baseFiles } = makeDebtRegistryFixture();
    try {
      const path = join(
        repoRoot,
        'apps/web/tests/unit/design-system/sidebar-nav-row-ratchet.test.ts'
      );
      const source = readFileSync(path, 'utf8');
      writeFileSync(
        path,
        source.replace(
          /const\s+ALLOWLIST\s*=\s*new\s+Set\s*\(\s*\[[\s\S]*?\]\s*\)/,
          'const ALLOWLIST = new Set(loadAllowlist())'
        )
      );
      const result = evaluateDesignDebtRegistries({
        repoRoot,
        trustedBaseRef: 'fixture-base',
        readBaseFile: registryPath => baseFiles.get(registryPath),
      });
      expect(result.ok).toBe(false);
      expect(result.issues.join('\n')).toMatch(
        /must contain exactly one ALLOWLIST new Set/
      );
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('fails closed on malformed registry shapes and new finding tuples', () => {
    const cases = [
      {
        path: ARBITRARY_BASELINE_RELATIVE,
        mutate: registry => {
          registry.count = -1;
        },
        expected: /candidate count is invalid/,
      },
      {
        path: 'apps/web/tests/unit/design-system/component-family.baseline.json',
        mutate: registry => {
          registry.allowedEmptyStatePaths = [
            registry.allowedEmptyStatePaths[0],
            registry.allowedEmptyStatePaths[0],
          ];
        },
        expected: /must be unique/,
      },
      {
        path: 'scripts/shared-ui-visual-arbitrary.baseline.json',
        mutate: registry => {
          registry.totalFindings += 1;
        },
        expected: /totalFindings/,
      },
      {
        path: 'scripts/shared-ui-visual-arbitrary.baseline.json',
        mutate: registry => {
          registry.findings.push({
            file: 'packages/ui/z-new.tsx',
            value: 'text-[99px]',
            count: 1,
          });
          registry.totalFindings += 1;
        },
        expected: /candidate finding grew/,
      },
    ];
    for (const item of cases) {
      expectRegistryRegression(item.path, item.mutate, item.expected);
    }

    const { repoRoot, baseFiles } = makeDebtRegistryFixture();
    try {
      writeFileSync(join(repoRoot, ARBITRARY_BASELINE_RELATIVE), '{broken');
      const malformed = evaluateDesignDebtRegistries({
        repoRoot,
        trustedBaseRef: 'fixture-base',
        readBaseFile: path => baseFiles.get(path),
      });
      expect(malformed.ok).toBe(false);
      expect(malformed.issues.join('\n')).toMatch(/is not valid JSON/);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('rejects every missing provenance field and accepts a future expiry', () => {
    const { repoRoot } = makeDebtRegistryFixture();
    try {
      const base = DESIGN_DEBT_REGISTRIES[0];
      const cases = [
        [{ ...base, owner: '' }, /owner is required/],
        [{ ...base, reason: 'short' }, /reason is required/],
        [{ ...base, linearIssue: '3570' }, /linearIssue must be a JOV/],
        [
          { ...base, removalCondition: undefined, expiresAt: undefined },
          /removalCondition or expiresAt is required/,
        ],
        [
          { ...base, removalCondition: undefined, expiresAt: 'not-a-date' },
          /expiresAt must be a valid timestamp/,
        ],
        [
          {
            ...base,
            removalCondition: undefined,
            expiresAt: '2026-01-01T00:00:00.000Z',
          },
          /exception expired/,
        ],
        [{ ...base, evidence: [] }, /evidence must contain/],
        [
          { ...base, evidence: ['docs/design-system/missing-evidence.md'] },
          /evidence is missing/,
        ],
      ];
      for (const [entry, expected] of cases) {
        const issues = validateDesignDebtRegistryInventory([entry], {
          repoRoot,
          now: new Date('2026-08-29T00:00:00.000Z'),
        });
        expect(issues.join('\n')).toMatch(expected);
      }
      const futureExpiry = {
        ...base,
        removalCondition: undefined,
        expiresAt: '2027-01-01T00:00:00.000Z',
      };
      expect(
        validateDesignDebtRegistryInventory([futureExpiry], {
          repoRoot,
          now: new Date('2026-08-29T00:00:00.000Z'),
        })
      ).toEqual([]);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('rejects candidate-controlled inventory removal and retargeting', () => {
    const { repoRoot, baseFiles } = makeDebtRegistryFixture();
    try {
      const removed = evaluateDesignDebtRegistries({
        repoRoot,
        entries: DESIGN_DEBT_REGISTRIES.slice(1),
        trustedBaseRef: 'fixture-base',
        readBaseFile: path => baseFiles.get(path),
      });
      expect(removed.ok).toBe(false);
      expect(removed.issues.join('\n')).toMatch(
        /inventory removed web-arbitrary-values/
      );

      const retargeted = DESIGN_DEBT_REGISTRIES.map((entry, index) =>
        index === 0
          ? { ...entry, projection: { kind: 'count', pointer: ['other'] } }
          : entry
      );
      const retarget = evaluateDesignDebtRegistries({
        repoRoot,
        entries: retargeted,
        trustedBaseRef: 'fixture-base',
        readBaseFile: path => baseFiles.get(path),
      });
      expect(retarget.ok).toBe(false);
      expect(retarget.issues.join('\n')).toMatch(/inventory retargeted/);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('accepts a valid unchanged serif exception object', () => {
    const { repoRoot, baseFiles } = makeDebtRegistryFixture();
    try {
      const exception = {
        path: 'apps/web/components/media/Cover.tsx',
        match: 'font-family: Georgia',
        kind: 'media',
        owner: 'design-system-steward',
        reason: 'Embedded media preserves source typography.',
      };
      writeRegistry(
        repoRoot,
        'scripts/design-authority-exceptions.json',
        value => {
          value.serif = [exception];
        }
      );
      const base = JSON.parse(
        baseFiles.get('scripts/design-authority-exceptions.json')
      );
      base.serif = [exception];
      baseFiles.set(
        'scripts/design-authority-exceptions.json',
        `${JSON.stringify(base, null, 2)}\n`
      );
      const result = evaluateDesignDebtRegistries({
        repoRoot,
        trustedBaseRef: 'fixture-base',
        readBaseFile: path => baseFiles.get(path),
      });
      expect(result.ok, result.issues.join('\n')).toBe(true);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('allows ceiling lowering and records which registries tightened', () => {
    const { repoRoot, baseFiles } = makeDebtRegistryFixture();
    try {
      writeRegistry(repoRoot, ARBITRARY_BASELINE_RELATIVE, registry => {
        registry.count -= 1;
      });
      writeRegistry(
        repoRoot,
        'apps/web/tests/unit/design-system/component-family.baseline.json',
        registry => {
          registry.counts.button -= 1;
          registry.allowedEmptyStatePaths.pop();
        }
      );
      writeRegistry(
        repoRoot,
        'scripts/shared-ui-visual-arbitrary.baseline.json',
        registry => {
          registry.findings.shift();
          registry.totalFindings = registry.findings.reduce(
            (total, finding) => total + finding.count,
            0
          );
        }
      );
      const result = evaluateDesignDebtRegistries({
        repoRoot,
        trustedBaseRef: 'fixture-base',
        readBaseFile: path => baseFiles.get(path),
      });
      expect(result.ok, result.issues.join('\n')).toBe(true);
      expect(
        result.registries
          .filter(item => item.status === 'ceiling-lowered')
          .map(item => item.id)
      ).toEqual([
        'web-arbitrary-values',
        'component-family-counts',
        'component-family-empty-state-paths',
        'shared-ui-visual-arbitrary',
      ]);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('propagates a deliberate-red registry regression through the ci-fast lane', () => {
    const { repoRoot } = makeDebtRegistryFixture();
    try {
      cpSync(join(REPO_ROOT, 'scripts'), join(repoRoot, 'scripts'), {
        recursive: true,
      });
      writeFileSync(
        join(repoRoot, 'package.json'),
        `${JSON.stringify(
          {
            private: true,
            scripts: {
              'design:source-count-ratchet':
                'node scripts/design-system-source-ratchet.mjs',
            },
          },
          null,
          2
        )}\n`
      );
      const trustedBase = commitFixture(repoRoot);
      writeRegistry(repoRoot, ARBITRARY_BASELINE_RELATIVE, registry => {
        registry.count += 1;
      });

      const cli = spawnSync(
        process.execPath,
        [join(repoRoot, 'scripts/design-system-source-ratchet.mjs')],
        {
          cwd: repoRoot,
          encoding: 'utf8',
          env: { ...process.env, TURBO_SCM_BASE: trustedBase },
        }
      );
      if (cli.status === 0) {
        throw new Error(`unexpected green CLI:\n${cli.stdout}${cli.stderr}`);
      }
      expect(cli.status).not.toBe(0);
      expect(`${cli.stdout}${cli.stderr}`).toMatch(
        /candidate ceiling grew .* same-PR raises are forbidden/
      );

      const outcome = withEnvironment(
        {
          GITHUB_EVENT_NAME: 'workflow_dispatch',
          CI_PRODUCT_LANES: 'web',
        },
        () =>
          executeDesignSystemSourceRatchetLane(command => {
            expect(command).toBe(CHECK_COMMAND);
            return {
              code: cli.status ?? 1,
              output: `${cli.stdout}${cli.stderr}`,
            };
          })
      );
      expect(outcome.code, outcome.output).not.toBe(0);
      expect(outcome.output).toMatch(
        /candidate ceiling grew .* same-PR raises are forbidden/
      );

      const nativeLane = spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '--eval',
          `import { executeDesignSystemSourceRatchetLane } from ${JSON.stringify(resolve(REPO_ROOT, 'scripts/ci-fast-lanes.mjs'))}; const result = executeDesignSystemSourceRatchetLane(); console.log(JSON.stringify(result)); process.exit(result.code);`,
        ],
        {
          cwd: repoRoot,
          encoding: 'utf8',
          env: {
            ...process.env,
            GITHUB_EVENT_NAME: 'workflow_dispatch',
            CI_PRODUCT_LANES: 'operations',
            TURBO_SCM_BASE: trustedBase,
          },
        }
      );
      expect(nativeLane.status).toBe(1);
      expect(`${nativeLane.stdout}${nativeLane.stderr}`).toMatch(
        /candidate ceiling grew .* same-PR raises are forbidden/
      );
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  }, 20_000);
});

describe('design-system source count ratchet (JOV-5301)', () => {
  it('is a cheap remaining-group filesystem scan, not unit/e2e', () => {
    expect(LANE_GROUPS.remaining).toContain('design-system-source-ratchet');
    expect(LANE_COMMANDS['design-system-source-ratchet']).toBe(CHECK_COMMAND);
    expect(PACKAGE_JSON.scripts['design:source-count-ratchet']).toBe(
      'node scripts/design-system-source-ratchet.mjs'
    );
    expect(CHECK_COMMAND).not.toMatch(/vitest|playwright|e2e/i);
  });

  it('runs cross-product for operations-only registry changes', () => {
    let calls = 0;
    const result = withEnvironment(
      {
        GITHUB_EVENT_NAME: 'pull_request',
        CI_PRODUCT_LANES: 'operations',
      },
      () =>
        executeDesignSystemSourceRatchetLane(command => {
          calls += 1;
          expect(command).toBe(CHECK_COMMAND);
          return { code: 0, output: 'checked operations registry\n' };
        })
    );
    expect(calls).toBe(1);
    expect(result).toEqual({
      code: 0,
      output: 'checked operations registry\n',
    });
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
      expect(countDesignSystemSourceMetrics(webRoot)).toMatchObject({
        arbitraryCount: 2,
        linearNamespace: { count: 3 },
      });
      expect(
        evaluateDesignSystemSourceRatchet({
          repoRoot,
          webRoot,
          compareRegistries: false,
        }).ok
      ).toBe(true);

      writeFileSync(
        join(webRoot, 'app', 'page.tsx'),
        'export const classes = "w-[12px] text-[#fff] h-[42rem]";\n'
      );
      writeFileSync(
        join(webRoot, 'styles', 'tokens.css'),
        ':root { --linear-text-primary: #fff; --linear-border: #000; --linear-extra: 1; }\n'
      );
      const growth = evaluateDesignSystemSourceRatchet({
        repoRoot,
        webRoot,
        compareRegistries: false,
      });
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
      const shrink = evaluateDesignSystemSourceRatchet({
        repoRoot,
        webRoot,
        compareRegistries: false,
      });
      expect(shrink.ok).toBe(true);
      expect(shrink.metrics.map(metric => metric.count)).toEqual([0, 2]);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('passes the live apps/web tree against committed baselines', () => {
    const started = Date.now();
    const result = evaluateDesignSystemSourceRatchet({
      repoRoot: REPO_ROOT,
      trustedBaseRef: INVENTORY_BOOTSTRAP_BASE,
    });
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
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: { ...process.env, TURBO_SCM_BASE: INVENTORY_BOOTSTRAP_BASE },
      }
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/PASS/);
  });
});
