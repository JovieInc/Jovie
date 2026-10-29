import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  deletionCandidates,
  divergentDirectDependencies,
  evaluateWasteRatchet,
  issuesInFiles,
  lockfileDuplicates,
  measureAgentContext,
  RATCHETED,
  ratchetEntry,
  rulePaths,
  skillListingBytes,
  summarizeCiRuns,
  summarizeKnip,
  tightenBaseline,
  wasteScore,
} from '../waste-sweep.mjs';

const issue = overrides => ({
  file: 'apps/web/lib/a.ts',
  files: [],
  exports: [],
  types: [],
  duplicates: [],
  enumMembers: [],
  dependencies: [],
  devDependencies: [],
  optionalPeerDependencies: [],
  unlisted: [],
  unresolved: [],
  binaries: [],
  ...overrides,
});

const report = {
  issues: [
    issue({
      file: 'apps/web/lib/dead.ts',
      files: [{ name: 'apps/web/lib/dead.ts' }],
    }),
    issue({
      file: '.agents/skills/x.ts',
      files: [{ name: '.agents/skills/x.ts' }],
    }),
    issue({
      file: 'apps/web/lib/a.ts',
      exports: [{ name: 'foo' }, { name: 'bar' }],
      types: [{ name: 'Baz' }],
      duplicates: [[{ name: 'a' }, { name: 'b' }]],
    }),
    issue({
      file: 'apps/desktop/package.json',
      devDependencies: [{ name: 'left-pad' }],
      unlisted: [{ name: 'vite' }],
      binaries: [{ name: 'jq' }],
    }),
  ],
};

const baselineFor = counts => ({
  ratchets: Object.fromEntries(
    RATCHETED.map(d => [d, ratchetEntry(d, counts[d] ?? 0)])
  ),
});

describe('summarizeKnip', () => {
  it('counts every ratcheted issue type and ignores system binaries', () => {
    const { counts, files, dependencies } = summarizeKnip(report, path =>
      path.endsWith('dead.ts') ? 500 : 10
    );
    expect(counts).toMatchObject({
      unusedFiles: 2,
      unusedFileBytes: 510,
      unusedExports: 2,
      unusedTypes: 1,
      duplicateExports: 1,
      unusedDependencies: 1,
      unlistedDependencies: 1,
    });
    expect(files[0]).toEqual({ path: 'apps/web/lib/dead.ts', bytes: 500 });
    expect(dependencies).toEqual([
      { workspace: 'apps/desktop/package.json', name: 'left-pad' },
    ]);
  });
});

describe('evaluateWasteRatchet', () => {
  const counts = summarizeKnip(report).counts;

  it('passes at the baseline and reports improvements without failing', () => {
    expect(evaluateWasteRatchet(counts, baselineFor(counts)).ok).toBe(true);
    const better = { ...counts, unusedExports: 1 };
    const verdict = evaluateWasteRatchet(better, baselineFor(counts));
    expect(verdict.ok).toBe(true);
    expect(verdict.improvements.map(r => r.dimension)).toEqual([
      'unusedExports',
    ]);
  });

  it('fails when any count rises, including a zero baseline', () => {
    const worse = { ...counts, unusedExports: 3 };
    const verdict = evaluateWasteRatchet(worse, baselineFor(counts));
    expect(verdict.ok).toBe(false);
    expect(verdict.regressions[0].dimension).toBe('unusedExports');
    const zero = baselineFor({ ...counts, unusedDependencies: 0 });
    expect(evaluateWasteRatchet(counts, zero).ok).toBe(false);
    expect(
      evaluateWasteRatchet({ ...counts, unusedDependencies: 0 }, zero).ok
    ).toBe(true);
  });

  it('tightens only improved dimensions and never loosens', () => {
    const baseline = baselineFor(counts);
    const lower = tightenBaseline(baseline, { ...counts, unusedFiles: 1 });
    expect(lower.changed).toBe(true);
    expect(lower.baseline.ratchets.unusedFiles.baseline).toBe(1);
    const higher = tightenBaseline(baseline, { ...counts, unusedFiles: 9 });
    expect(higher.changed).toBe(false);
    expect(higher.baseline.ratchets.unusedFiles.baseline).toBe(2);
  });
});

describe('issuesInFiles', () => {
  it('names the knip findings inside changed files only', () => {
    expect(issuesInFiles(report, ['apps/web/lib/a.ts'])).toEqual([
      {
        path: 'apps/web/lib/a.ts',
        kinds: ['exports: foo, bar', 'types: Baz', 'duplicates: a, b'],
      },
    ]);
  });
});

describe('agent context', () => {
  it('reads skill listing bytes from single-line and block descriptions', () => {
    expect(
      skillListingBytes('---\nname: ab\ndescription: hello\n---\nbody')
    ).toBe(7);
    expect(
      skillListingBytes(
        '---\nname: ab\ndescription: |\n  one\n  two\nversion: 1\n---\n'
      )
    ).toBe(2 + 'one two'.length);
    expect(skillListingBytes('no frontmatter')).toBe(0);
  });

  it('parses scoped rule globs and treats rules without them as always loaded', () => {
    expect(rulePaths('---\npaths: ["a/**", "b.md"]\n---\n')).toEqual([
      'a/**',
      'b.md',
    ]);
    expect(rulePaths('# no frontmatter')).toBeNull();
  });

  it('dedupes the AGENTS.md symlink and counts unscoped rules', () => {
    const root = mkdtempSync(join(tmpdir(), 'waste-ctx-'));
    writeFileSync(join(root, 'CLAUDE.md'), '1234567890');
    symlinkSync('CLAUDE.md', join(root, 'AGENTS.md'));
    mkdirSync(join(root, 'canon'));
    writeFileSync(join(root, 'canon/OPERATING_SYSTEM.md'), '12345');
    mkdirSync(join(root, '.claude/rules'), { recursive: true });
    writeFileSync(join(root, '.claude/rules/always.md'), 'abc');
    writeFileSync(
      join(root, '.claude/rules/web.md'),
      '---\npaths: ["apps/web/**/*.tsx"]\n---\nx'
    );
    mkdirSync(join(root, '.claude/skills/s'), { recursive: true });
    writeFileSync(
      join(root, '.claude/skills/s/SKILL.md'),
      '---\nname: s\ndescription: dd\n---\n'
    );
    const context = measureAgentContext(root);
    expect(context.entryBytes).toEqual({
      'CLAUDE.md': 10,
      'canon/OPERATING_SYSTEM.md': 5,
    });
    expect(context.alwaysLoadedBytes).toBe(10 + 5 + 3 + 3);
    expect(context.unscopedRules).toEqual(['.claude/rules/always.md']);
    expect(context.ruleBytesPerEdit.webComponent).toBeGreaterThan(
      context.ruleBytesPerEdit.webLib
    );
  });
});

describe('dependencies', () => {
  it('finds multi-version lockfile packages', () => {
    const lock = [
      "lockfileVersion: '9.0'",
      '',
      'packages:',
      '',
      '  semver@6.3.1:',
      '    resolution: {}',
      '  semver@7.7.4:',
      "  '@types/node@20.0.0':",
      "  '@types/node@24.0.0':",
      '  zod@4.0.0:',
      '',
      'snapshots:',
      '',
      '  semver@5.0.0:',
    ].join('\n');
    const result = lockfileDuplicates(lock);
    expect(result.multiVersionPackages).toBe(2);
    expect(result.extraVersions).toBe(2);
  });

  it('finds direct dependencies with diverging specifiers', () => {
    expect(
      divergentDirectDependencies({
        'a/package.json': { dependencies: { zod: '^4.1.0', x: 'workspace:*' } },
        'b/package.json': { devDependencies: { zod: '4.1.0' } },
        'c/package.json': { devDependencies: { typescript: '^5.7.0' } },
        'd/package.json': { devDependencies: { typescript: '^6.0.3' } },
      })
    ).toEqual([
      {
        name: 'typescript',
        specs: { 'c/package.json': '5.7.0', 'd/package.json': '6.0.3' },
      },
    ]);
  });
});

describe('CI and candidates', () => {
  const run = (c, minutes) => ({
    c,
    s: '2026-10-01T00:00:00Z',
    u: new Date(
      Date.parse('2026-10-01T00:00:00Z') + minutes * 60_000
    ).toISOString(),
  });
  const rows = [
    {
      path: '.github/workflows/red.yml',
      total: 40,
      runs: Array.from({ length: 20 }, () => run('failure', 5)),
    },
    {
      path: '.github/workflows/green.yml',
      total: 20,
      runs: Array.from({ length: 20 }, () => run('success', 1)),
    },
    { path: '.github/workflows/idle.yml', total: 0, runs: [] },
  ];

  it('scales sampled minutes and classifies red, idle and never-failed workflows', () => {
    const ci = summarizeCiRuns(rows);
    expect(ci.wallMinutes).toBe(200 + 20);
    expect(ci.alwaysRed).toEqual([
      { path: '.github/workflows/red.yml', wallMinutes: 200 },
    ]);
    expect(ci.neverRan).toEqual(['.github/workflows/idle.yml']);
    expect(ci.neverFailed.map(w => w.path)).toEqual([
      '.github/workflows/green.yml',
    ]);
  });

  it('ranks candidates, skips vendored paths and keeps stable fingerprints', () => {
    const knip = summarizeKnip(report, () => 100);
    const candidates = deletionCandidates(knip, summarizeCiRuns(rows), 5);
    expect(candidates[0].kind).toBe('always-red-workflow');
    expect(candidates.map(c => c.path)).not.toContain('.agents/skills/x.ts');
    expect(candidates.find(c => c.kind === 'unused-file').fingerprint).toBe(
      'waste-sweep:unused-file:apps/web/lib/dead.ts'
    );
  });

  it('scores every dimension', () => {
    expect(
      wasteScore({
        knip: { unusedFiles: 1, unusedExports: 2, unusedDependencies: 1 },
        agentContext: { alwaysLoadedBytes: 2048 },
        ci: { alwaysRedMinutes: 60 },
      })
    ).toBe(10 + 2 + 25 + 10 + 2);
  });
});
