import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  countIn,
  language,
  RATCHET_PATH,
  RATCHET_SCHEMA,
  scan,
  stripComments,
  tighten,
  violations,
} from '../../wall-clock-test-guard.mjs';

const ROOT = new URL('../../../', import.meta.url);

describe('wall-clock-test-guard', () => {
  it('flags a real clock compared with a typed calendar date', () => {
    // The 2026-11-10 shape: a review deadline read against today's clock.
    expect(
      countIn(
        "expect(Date.now()).toBeLessThan(Date.parse('2026-11-07T06:00:00Z'));"
      )
    ).toBe(1);
    expect(
      countIn(
        "const receipt = { reviewAfter: '2026-12-15' };\nvalidate(receipt, new Date());"
      )
    ).toBe(1);
    expect(
      countIn('const due = new Date(2027, 0, 1);\nassert(new Date() < due);')
    ).toBe(1);
    expect(
      countIn(
        'due = datetime(2027, 1, 1)\nassert datetime.now() < due\nassert time.time() > 0\n',
        'py'
      )
    ).toBe(2);
  });

  it('passes a controlled clock, an injected clock and relative dates', () => {
    expect(
      countIn(
        "vi.useFakeTimers();\nvi.setSystemTime(new Date('2026-11-01T00:00:00Z'));\nexpect(Date.now()).toBeLessThan(Date.parse('2026-11-07T06:00:00Z'));"
      )
    ).toBe(0);
    expect(
      countIn(
        "const now = new Date('2026-11-01T00:00:00Z');\nexpect(validate(receipt, now)).toEqual([]);"
      )
    ).toBe(0);
    expect(
      countIn(
        'const tomorrow = new Date(Date.now() + 86_400_000);\nexpect(isUpcoming(tomorrow)).toBe(true);'
      )
    ).toBe(0);
    expect(
      countIn(
        "mock.timers.enable({ apis: ['Date'], now: 0 });\nconst a = new Date();\nconst b = '2026-01-01';"
      )
    ).toBe(0);
    expect(
      countIn(
        "@freeze_time('2026-11-01')\ndef test_due():\n    assert datetime.now() < datetime(2027, 1, 1)\n",
        'py'
      )
    ).toBe(0);
  });

  it('ignores dates and clock reads that only appear in comments', () => {
    expect(
      countIn('// failed on 2026-11-10T06:00Z\nconst id = Date.now();')
    ).toBe(0);
    expect(
      countIn(
        "/* new Date() */\nconst due = '2026-11-07';\nconst u = 'https://jov.ie';"
      )
    ).toBe(0);
    expect(countIn("# due '2026-11-07'\nstarted = time.time()\n", 'py')).toBe(
      0
    );
    expect(countIn("const v = 'release-2026-11-07';\nDate.now();")).toBe(0);
  });

  it('keeps scanning after comment markers that sit inside strings', () => {
    // Two globs would read as one block comment to a string-blind stripper
    // and hide the clock read between them.
    expect(
      countIn(
        "const a = 'apps/web/**';\nconst overdue = Date.now() > Date.parse('2026-11-07T06:00:00Z');\nconst b = '**/x';"
      )
    ).toBe(1);
    expect(
      countIn(
        "const u = 'http://localhost/*';\nassert(new Date() < new Date(2027, 0, 1));\nconst v = 'x*/';"
      )
    ).toBe(1);
    expect(
      countIn(
        'const u = "//cdn.example"; const d = \'2026-11-07\'; Date.now();'
      )
    ).toBe(1);
    expect(
      countIn(
        'const t = `a/* ${1} `;\nconst d = "2026-11-07";\nDate.now();\nconst z = `*/`;'
      )
    ).toBe(1);
    expect(
      countIn("color = '#fff'; due = '2026-11-07'; now = time.time()\n", 'py')
    ).toBe(1);
    expect(
      countIn(
        'doc = \"\"\"# not a comment\"\"\"\ndue = datetime(2027, 1, 1)\nnow = datetime.now()\n',
        'py'
      )
    ).toBe(1);
    // Nested templates: the inner template must not flip string/code parity.
    expect(
      countIn(
        "const html = `<ul>${items.map(i => `<li>${i.id}</li>`).join('')}</ul> see http://x/y`;\nconst due = '2026-11-07';\nconst late = Date.now() > 1;"
      )
    ).toBe(1);
    expect(
      stripComments(
        'const a = `x ${f({ k: `y ${z /* c */} //n` })} //kept`; // gone\nb();'
      )
    ).toBe('const a = `x ${f({ k: `y ${z  } //n` })} //kept`; \nb();');
    expect(stripComments('const t = `a \\` // b ${1}`; // c')).toBe(
      'const t = `a \\` // b ${1}`; '
    );
    expect(stripComments("a = 'x' // tail\n/* b */c")).toBe("a = 'x' \n c");
    expect(stripComments("a = 'x'  # tail\nb\n", 'py')).toBe("a = 'x'  \nb\n");
  });

  it('scans JS/TS and Python tests only, never vendored skill trees', () => {
    expect(language('apps/web/tests/unit/a.test.tsx')).toBe('js');
    expect(language('scripts/lib/__tests__/a.test.mjs')).toBe('js');
    expect(language('apps/web/tests/e2e/a.spec.ts')).toBe('js');
    expect(language('scripts/tests/test_a.py')).toBe('py');
    expect(language('scripts/lanes/a_test.py')).toBe('py');
    expect(language('apps/web/lib/a.ts')).toBeNull();
    expect(
      language('apps/web/tests/utils/calendar-deadline-clock.ts')
    ).toBeNull();
    expect(language('.agents/skills/gstack/x.test.ts')).toBeNull();
  });

  it('flags growth and a new file, and only shrinks the ratchet', () => {
    expect(violations({ a: 2, b: 1 }, { a: 1 })).toEqual([
      { file: 'a', found: 2, allowed: 1 },
      { file: 'b', found: 1, allowed: 0 },
    ]);
    expect(tighten({ a: 1 }, { a: 3, b: 1 })).toEqual({ a: 1 });
  });

  it('keeps the committed ratchet at or above what the tree holds today', () => {
    const ratchet = JSON.parse(
      readFileSync(new URL(RATCHET_PATH, ROOT), 'utf8')
    );
    expect(ratchet.schema).toBe(RATCHET_SCHEMA);
    const counts = scan(ROOT.pathname, Object.keys(ratchet.entries));
    expect(violations(counts, ratchet.entries)).toEqual([]);
    // The calendar bombs migrated with the guard stay out of the ratchet.
    for (const file of [
      'apps/web/content/published-claims.test.ts',
      'apps/web/tests/unit/lib/testing/quarantine-ledger.test.ts',
      'apps/web/tests/unit/profile/ProfileHomeRail.test.tsx',
    ])
      expect(ratchet.entries[file]).toBeUndefined();
  });
});
