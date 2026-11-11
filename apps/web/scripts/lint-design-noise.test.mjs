import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BASELINE_PATH,
  collect,
  compareToBaseline,
  findNoise,
  main,
} from './lint-design-noise.mjs';

const rules = src => findNoise(src, 'x.tsx').map(f => f.rule);

describe('findNoise deliberate-red cases', () => {
  it('flags an icon inside a bordered, filled tile', () => {
    expect(
      rules(
        `import { Users } from 'lucide-react';
<div className='flex h-11 w-11 items-center justify-center rounded-xl border border-subtle bg-surface-1'><Users className='h-6 w-6' /></div>`
      )
    ).toContain('icon-tile');
  });

  it('flags an emoji inside a filled container', () => {
    expect(
      rules(`<span className='size-8 rounded-full bg-surface-2'>🎵</span>`)
    ).toContain('icon-tile');
  });

  it('allows a bare icon', () => {
    expect(rules(`<Users className='h-6 w-6 text-secondary-token' />`)).toEqual(
      []
    );
  });

  it('flags retired tile components', () => {
    expect(rules(`<IconBadge name='x' colorVar='--a' />`)).toContain(
      'icon-tile-comp'
    );
  });

  it('flags visible Step N but allows sr-only', () => {
    expect(rules(`<span className='mt-5'>Step {i + 1}</span>`)).toContain(
      'step-label'
    );
    expect(rules(`<span className='sr-only'>Step {i + 1}</span>`)).toEqual([]);
  });

  it('flags an ad-hoc email field but not InlineSubscribe users', () => {
    expect(rules(`<input type='email' />`)).toContain('email-capture');
    expect(
      rules(`import { InlineSubscribe } from 'x'; <input type='email' />`)
    ).toEqual([]);
  });

  it('flags a submit button disabled by field validity', () => {
    expect(
      rules(`<Button type='submit' disabled={!email.trim()}>Go</Button>`)
    ).toContain('disabled-submit');
  });

  it('flags a filler bio', () => {
    expect(
      rules(`<p>{bio ?? 'Public creator profile on Jovie.'}</p>`)
    ).toContain('filler-bio');
  });

  it('flags helper copy that restates the CTA', () => {
    const src = `const c = { buttonLabel: 'Subscribe', consent: 'Subscribe to Jovie changelog emails.' };`;
    expect(rules(src)).toContain('copy-redundancy');
  });
});

describe('ratchet', () => {
  it('fails new debt', () => {
    expect(compareToBaseline({ 'a.tsx': { 'icon-tile': 1 } }, {})).toHaveLength(
      1
    );
    expect(
      compareToBaseline(
        { 'a.tsx': { 'icon-tile': 3 } },
        { 'a.tsx': { 'icon-tile': 2 } }
      )
    ).toEqual([expect.stringContaining('a.tsx: icon-tile x3 (baseline 2)')]);
  });

  it('passes removed debt without a baseline rewrite', () => {
    // 19 merge groups failed 2026-11-04..11 on "debt shrank (0 < 2)" for a
    // file another PR had cleaned up. Stale headroom is tightened later by
    // scripts/baselines-tighten.mjs; it is not a reason to fail a group.
    expect(compareToBaseline({}, { 'a.tsx': { 'icon-tile': 2 } })).toEqual([]);
    expect(
      compareToBaseline(
        { 'a.tsx': { 'icon-tile': 1 } },
        { 'a.tsx': { 'icon-tile': 2 } }
      )
    ).toEqual([]);
  });

  it('has no growth beyond the committed baseline', () => {
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).files;
    expect(compareToBaseline(collect(), baseline)).toEqual([]);
  });

  describe('cli', () => {
    const run = (argv, baseline, current) => {
      const baselinePath = join(
        mkdtempSync(join(tmpdir(), 'design-noise-')),
        'baseline.json'
      );
      writeFileSync(baselinePath, JSON.stringify({ files: baseline }));
      const out = [];
      const code = main(argv, {
        baselinePath,
        current,
        log: line => out.push(line),
        error: line => out.push(line),
      });
      return {
        code,
        out: out.join('\n'),
        files: JSON.parse(readFileSync(baselinePath, 'utf8')).files,
      };
    };
    const baseline = {
      'a.tsx': { 'icon-tile': 2 },
      'b.tsx': { 'icon-tile': 1 },
    };

    it('passes a shrink with a notice and leaves the baseline alone', () => {
      const result = run([], baseline, { 'a.tsx': { 'icon-tile': 1 } });
      expect(result.code).toBe(0);
      expect(result.out).toContain('a.tsx > icon-tile 2 -> 1');
      expect(result.files).toEqual(baseline);
    });

    it('fails growth', () => {
      const result = run([], baseline, { 'a.tsx': { 'icon-tile': 3 } });
      expect(result.code).toBe(1);
      expect(result.out).toContain('a.tsx: icon-tile x3 (baseline 2)');
    });

    it('--tighten lowers entries and passes a clean tree', () => {
      const result = run(['--tighten'], baseline, {
        'a.tsx': { 'icon-tile': 1 },
      });
      expect(result.code).toBe(0);
      expect(result.files).toEqual({ 'a.tsx': { 'icon-tile': 1 } });
    });

    it('--tighten still fails growth and never adopts it', () => {
      const result = run(['--tighten'], baseline, {
        'a.tsx': { 'icon-tile': 3 },
        'new.tsx': { 'step-label': 1 },
      });
      expect(result.code).toBe(1);
      expect(result.out).toContain('new.tsx: step-label x1 (baseline 0)');
      expect(result.files).toEqual({ 'a.tsx': { 'icon-tile': 2 } });
    });

    it('--update is the explicit floor raise', () => {
      const current = { 'new.tsx': { 'step-label': 1 } };
      const result = run(['--update', '--list'], baseline, current);
      expect(result.code).toBe(0);
      expect(result.files).toEqual(current);
    });
  });
});
