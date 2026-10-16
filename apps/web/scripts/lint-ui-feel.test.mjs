/**
 * Unit tests for the lint-ui-feel ratchet (JOV-8197).
 *
 * The regression math (countByCheck + regressions) is pure and always runs.
 * The ESLint wiring is exercised only while eslint-rules/ui-feel.js exists —
 * before JOV-8196 lands on main the guard intentionally skips, matching the
 * script's own graceful skip.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  addedLines,
  BASELINE_KEYS,
  checkChanged,
  collectViolations,
  countByCheck,
  loadUiFeelRule,
  main,
  readBaseline,
  regressions,
  violationsOnAddedLines,
} from './lint-ui-feel.mjs';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const RULE_PRESENT = existsSync(
  join(projectRoot, 'eslint-rules', 'ui-feel.js')
);

describe('ui-feel ratchet baseline math', () => {
  it('reports no regressions when counts equal the baseline', () => {
    const counts = { headingNeedsBalance: 3, missingTabularNums: 4 };
    expect(regressions(counts, counts)).toEqual([]);
  });

  it('reports no regressions when counts shrink below the baseline', () => {
    expect(
      regressions({ headingNeedsBalance: 0 }, { headingNeedsBalance: 5 })
    ).toEqual([]);
  });

  it('fails only the check that grows past its baseline', () => {
    const failures = regressions(
      {
        headingNeedsBalance: 2,
        missingTabularNums: 1,
        undersizedHitArea: 9,
      },
      {
        headingNeedsBalance: 2,
        missingTabularNums: 4,
        undersizedHitArea: 8,
      }
    );
    expect(failures).toEqual([
      { check: 'undersizedHitArea', baseline: 8, current: 9 },
    ]);
  });

  it('treats a check absent from the baseline as zero', () => {
    expect(regressions({ newCheck: 1 }, {})).toEqual([
      { check: 'newCheck', baseline: 0, current: 1 },
    ]);
  });

  it('countByCheck buckets violations by messageId', () => {
    const counts = countByCheck([
      { file: 'a.tsx', line: 1, messageId: 'missingTabularNums' },
      { file: 'a.tsx', line: 2, messageId: 'missingTabularNums' },
      { file: 'b.tsx', line: 3, messageId: 'undersizedHitArea' },
      { file: 'b.tsx', line: 4, messageId: 'someNewCheck' },
    ]);
    expect(counts.missingTabularNums).toBe(2);
    expect(counts.undersizedHitArea).toBe(1);
    expect(counts.someNewCheck).toBe(1);
    expect(counts.headingNeedsBalance).toBe(0);
    expect(counts.nonConcentricRadius).toBe(0);
  });

  it('leaves enforcement to the ratchet, not the shared eslint config', () => {
    // As 'error', lint-staged and lint:eslint:changed failed on the baselined
    // legacy violations in any touched file; the ratchet owns the gate.
    const config = readFileSync(join(projectRoot, 'eslint.config.js'), 'utf8');
    expect(config).toMatch(/'@jovie\/ui-feel':\s*'off'/);
  });

  it('committed baseline only uses known check keys', () => {
    const baseline = readBaseline();
    for (const key of BASELINE_KEYS) {
      expect(baseline, `missing key ${key}`).toHaveProperty(key);
      expect(typeof baseline[key]).toBe('number');
    }
    for (const key of Object.keys(baseline)) {
      expect(BASELINE_KEYS).toContain(key);
    }
  });

  it('readBaseline returns an empty object for a missing file', () => {
    expect(
      readBaseline(join(mkdtempSync(join(tmpdir(), 'uifeel-')), 'none.json'))
    ).toEqual({});
  });

  it('collectViolations returns no violations without a rule', async () => {
    expect(await collectViolations({ rule: null })).toEqual([]);
  });
});

describe('ui-feel cli gate', () => {
  const fakeRule = { create: () => ({}) };
  const violations = [
    { file: 'a.tsx', line: 2, messageId: 'missingTabularNums' },
    { file: 'a.tsx', line: 1, messageId: 'undersizedHitArea' },
  ];
  const collect = async () => violations;
  const tmpBaseline = () =>
    join(mkdtempSync(join(tmpdir(), 'uifeel-')), 'baseline.json');
  const silent = () => {};

  it('exits 0 with a skip note when the rule is absent', async () => {
    const logs = [];
    const code = await main([], m => logs.push(m), {
      loadRule: () => null,
    });
    expect(code).toBe(0);
    expect(logs.join('\n')).toContain('nothing to ratchet');
  });

  it('exits 1 when the rule registration is broken', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const code = await main([], silent, {
        loadRule: () => {
          throw new Error('boom');
        },
      });
      expect(code).toBe(1);
      expect(errors.mock.calls.flat().join('\n')).toContain('boom');
    } finally {
      errors.mockRestore();
    }
  });

  it('writes a sorted baseline on --update and exits 0', async () => {
    const baselinePath = tmpBaseline();
    const logs = [];
    const code = await main(['--update', '--list'], m => logs.push(m), {
      loadRule: () => fakeRule,
      collect,
      baselinePath,
    });
    expect(code).toBe(0);
    expect(logs.join('\n')).toContain('a.tsx:1');
    expect(logs.join('\n')).toContain('baseline updated');
    const written = JSON.parse(readFileSync(baselinePath, 'utf8'));
    expect(written._comment).toContain('JOV-8197');
    expect(written.missingTabularNums).toBe(1);
    expect(written.undersizedHitArea).toBe(1);
    expect(Object.keys(written).filter(k => k !== '_comment')).toEqual(
      [...Object.keys(written).filter(k => k !== '_comment')].sort()
    );
  });

  it('writes a baseline when none exists even without --update', async () => {
    const code = await main([], silent, {
      loadRule: () => fakeRule,
      collect,
      baselinePath: tmpBaseline(),
    });
    expect(code).toBe(0);
  });

  it('exits 0 when counts stay within the baseline', async () => {
    const baselinePath = tmpBaseline();
    await main(['--update'], silent, {
      loadRule: () => fakeRule,
      collect,
      baselinePath,
    });
    const logs = [];
    const code = await main([], m => logs.push(m), {
      loadRule: () => fakeRule,
      collect,
      baselinePath,
    });
    expect(code).toBe(0);
    expect(logs.join('\n')).toContain('within baseline');
  });

  it('exits 1 and reports regressions past the baseline', async () => {
    const baselinePath = tmpBaseline();
    await main(['--update'], silent, {
      loadRule: () => fakeRule,
      collect: async () => [],
      baselinePath,
    });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const code = await main([], silent, {
        loadRule: () => fakeRule,
        collect,
        baselinePath,
      });
      expect(code).toBe(1);
      const text = errors.mock.calls.flat().join('\n');
      expect(text).toContain('regression beyond baseline');
      expect(text).toContain('missingTabularNums: 1 > baseline 0');
    } finally {
      errors.mockRestore();
    }
  });
});

describe('ui-feel rule wiring', () => {
  it.skipIf(!RULE_PRESENT)(
    'committed baseline matches current debt without regression headroom',
    async () => {
      const rule = loadUiFeelRule();
      expect(rule).toBeTruthy();
      const violations = await collectViolations({ rule });
      expect(violations.length).toBeGreaterThan(0);
      const counts = countByCheck(violations);
      const baseline = readBaseline();
      expect(counts).toEqual(baseline);
    },
    300_000
  );

  it('loadUiFeelRule tracks rule file presence', () => {
    // With the rule absent and eslint.config.js not registering it,
    // loadUiFeelRule returns null so the gate defers until JOV-8196 lands.
    expect(Boolean(loadUiFeelRule())).toBe(RULE_PRESENT);
  });
});

describe('ui-feel added-lines gate (PR time)', () => {
  const DIFF = [
    'diff --git a/apps/web/components/Card.tsx b/apps/web/components/Card.tsx',
    '--- a/apps/web/components/Card.tsx',
    '+++ b/apps/web/components/Card.tsx',
    '@@ -3,0 +4,2 @@ export function Card() {',
    '+  <h2>New</h2>',
    '+  <p>x</p>',
    '@@ -9 +11 @@',
    '+  <h3>Edited</h3>',
    '@@ -20,2 +22,0 @@',
    'diff --git a/apps/web/lib/util.ts b/apps/web/lib/util.ts',
    '+++ b/apps/web/lib/util.ts',
    '@@ -1 +1 @@',
    'diff --git a/apps/docs/Page.tsx b/apps/docs/Page.tsx',
    '+++ b/apps/docs/Page.tsx',
    '@@ -1 +1 @@',
    '',
  ].join('\n');

  it('maps added lines per scanned web tsx file and skips pure deletions', () => {
    const added = addedLines(DIFF);
    expect([...added.keys()]).toEqual(['components/Card.tsx']);
    expect([...(added.get('components/Card.tsx') ?? [])]).toEqual([4, 5, 11]);
  });

  it('keeps only violations on added lines', () => {
    const added = addedLines(DIFF);
    const violations = [
      {
        file: 'components/Card.tsx',
        line: 4,
        messageId: 'headingNeedsBalance',
      },
      {
        file: 'components/Card.tsx',
        line: 7,
        messageId: 'headingNeedsBalance',
      },
      {
        file: 'components/Other.tsx',
        line: 4,
        messageId: 'missingTabularNums',
      },
    ];
    expect(violationsOnAddedLines(violations, added)).toEqual([violations[0]]);
  });

  it('fails closed when the base diff fails', async () => {
    const error = vi.fn();
    const code = await checkChanged({
      baseRef: 'origin/main',
      rule: {},
      spawn: () => ({ status: 128, stdout: '' }),
      error,
      log: () => {},
    });
    expect(code).toBe(1);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('could not diff')
    );
  });

  it.skipIf(!RULE_PRESENT)(
    'fails on a newly added violation but not on untouched legacy debt',
    async () => {
      const root = mkdtempSync(join(tmpdir(), 'ui-feel-gate-'));
      const webRoot = join(root, 'apps', 'web');
      mkdirSync(join(webRoot, 'components'), { recursive: true });
      writeFileSync(
        join(webRoot, 'components', 'Card.tsx'),
        [
          'export function Card() {',
          '  return (',
          '    <div>',
          '      <h2>Legacy heading</h2>',
          '      <h3>Added heading</h3>',
          '    </div>',
          '  );',
          '}',
          '',
        ].join('\n')
      );
      const diffFor = lines =>
        ['+++ b/apps/web/components/Card.tsx', `@@ -1,0 +${lines} @@`, ''].join(
          '\n'
        );
      const run = async lines => {
        const errors = [];
        const code = await checkChanged({
          baseRef: 'origin/main',
          rule: loadUiFeelRule(),
          webRoot,
          spawn: () => ({ status: 0, stdout: diffFor(lines) }),
          log: () => {},
          error: message => errors.push(message),
        });
        return { code, errors: errors.join('\n') };
      };
      try {
        const added = await run('5,1');
        expect(added.code).toBe(1);
        expect(added.errors).toContain(
          'components/Card.tsx:5  headingNeedsBalance'
        );
        expect(added.errors).not.toContain('components/Card.tsx:4');

        expect((await run('8,1')).code).toBe(0);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  );
});
