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
import { describe, expect, it } from 'vitest';
import {
  countViolations,
  findTouchTargetSourceFiles,
  findViolationsInSource,
  type RipgrepRunner,
  resolveTrustedRipgrepPath,
  runRipgrep,
  tagHasSub44Height,
} from '../../../lib/a11y-gates/touch-target-engine';

/**
 * Touch-target ratchet (JOV #12012, WCAG 2.5.5 / Apple HIG 44pt).
 *
 * Counts interactive elements (`<button>`, `<a>`, role="button") declaring
 * explicit sub-44px heights (`h-4`…`h-10`, `size-*`, `h-[Npx]` < 44) without
 * a ≥44px height/min-height rescue on the same element. The count may only
 * go DOWN — new sub-44px hit areas fail CI.
 *
 * Baseline: touch-target-ratchet.baseline.json (repo root of apps/web).
 * CLI: `pnpm --filter web run lint:touch-target -- [--list|--update]`.
 * Runtime complement: axe `target-size` via the Storybook+axe gate (#12008).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(__dirname, '..', '..', '..');
const BASELINE_PATH = join(WEB_ROOT, 'touch-target-ratchet.baseline.json');

describe('touch-target ratchet', () => {
  it('sub-44px interactive elements do not increase above the baseline', () => {
    const violations = countViolations(WEB_ROOT);
    const current = violations.length;

    // Self-seed on first run so baseline and count logic can never diverge.
    if (!existsSync(BASELINE_PATH)) {
      writeFileSync(
        BASELINE_PATH,
        `${JSON.stringify(
          {
            _comment:
              'Touch-target ratchet baseline — interactive elements with explicit sub-44px heights (lib/a11y-gates/touch-target-engine.ts). Ratchet only goes down.',
            count: current,
          },
          null,
          2
        )}\n`
      );
    }

    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as {
      count: number;
    };

    expect(
      current,
      `Touch-target regression: ${current} sub-44px interactive elements > baseline ${baseline.count}.\n` +
        'Interactive controls need a 44px minimum hit area (WCAG 2.5.5).\n' +
        'Fix: h-11+ (44px), min-h-11, or padding to expand the hit area.\n' +
        'Locate them: pnpm --filter web run lint:touch-target -- --list'
    ).toBeLessThanOrEqual(baseline.count);
  });

  it('baseline follows the work down (no stale slack)', () => {
    const current = countViolations(WEB_ROOT).length;
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as {
      count: number;
    };
    // Allow a small slack window so parallel PRs that remove violations
    // don't hard-block each other, but force periodic baseline updates.
    expect(
      baseline.count - current,
      `Baseline is ${baseline.count - current} above the real count (${current}). ` +
        'Run `pnpm --filter web run lint:touch-target -- --update` to lower it.'
    ).toBeLessThanOrEqual(25);
  });
});

describe('touch-target detection — violations are caught (red→green proof)', () => {
  it('prefilters candidates deterministically and falls back only on rg errors', () => {
    const scanRoot = mkdtempSync(join(tmpdir(), 'touch-target-ratchet-'));
    const result =
      (status: number | null, stdout = '', error?: Error): RipgrepRunner =>
      () => ({ status, stdout, error });

    try {
      mkdirSync(join(scanRoot, 'app'), { recursive: true });
      mkdirSync(join(scanRoot, 'components'), { recursive: true });
      writeFileSync(join(scanRoot, 'app', 'a.tsx'), '<button />');
      writeFileSync(join(scanRoot, 'components', 'z.tsx'), '<button />');

      const expected = [
        join(scanRoot, 'app', 'a.tsx'),
        join(scanRoot, 'components', 'z.tsx'),
      ];
      expect(
        findTouchTargetSourceFiles(
          scanRoot,
          result(0, 'components/z.tsx\napp/a.tsx\n')
        )
      ).toEqual(expected);
      expect(
        findTouchTargetSourceFiles(
          scanRoot,
          result(0, 'app/a.tsx\ncomponents/z.tsx\n')
        )
      ).toEqual(expected);
      expect(findTouchTargetSourceFiles(scanRoot, result(1))).toEqual([]);
      expect(findTouchTargetSourceFiles(scanRoot, result(2))).toEqual(expected);
      expect(
        findTouchTargetSourceFiles(
          scanRoot,
          result(null, '', new Error('spawnSync rg ENOENT'))
        )
      ).toEqual(expected);
    } finally {
      rmSync(scanRoot, { recursive: true, force: true });
    }
  });

  it('uses only trusted absolute rg paths and falls back when none exist', () => {
    const scanRoot = mkdtempSync(join(tmpdir(), 'touch-target-no-rg-'));

    try {
      mkdirSync(join(scanRoot, 'app'), { recursive: true });
      writeFileSync(join(scanRoot, 'app', 'fallback.tsx'), '<button />');

      expect(resolveTrustedRipgrepPath(() => false)).toBeNull();
      expect(
        findTouchTargetSourceFiles(scanRoot, root =>
          runRipgrep(root, () => null)
        )
      ).toEqual([join(scanRoot, 'app', 'fallback.tsx')]);
    } finally {
      rmSync(scanRoot, { recursive: true, force: true });
    }
  });

  it('ripgrep candidates preserve multiline and arbitrary-token violations', () => {
    const scanRoot = mkdtempSync(join(tmpdir(), 'touch-target-parity-'));

    try {
      mkdirSync(join(scanRoot, 'app'), { recursive: true });
      mkdirSync(join(scanRoot, 'components'), { recursive: true });
      writeFileSync(
        join(scanRoot, 'app', 'multiline.tsx'),
        '<button\n className="h-8 w-8"\n>compact</button>\n'
      );
      writeFileSync(
        join(scanRoot, 'components', 'arbitrary.tsx'),
        '<a className="size-[43.5px]">compact</a>\n'
      );
      writeFileSync(
        join(scanRoot, 'components', 'safe.tsx'),
        '<button className="h-11">safe</button>\n'
      );

      const fallback: RipgrepRunner = () => ({ status: 2, stdout: '' });
      expect(countViolations(scanRoot)).toEqual(
        countViolations(scanRoot, fallback)
      );
      expect(countViolations(scanRoot)).toHaveLength(2);
    } finally {
      rmSync(scanRoot, { recursive: true, force: true });
    }
  });

  it('RED: flags a sub-44px icon button', () => {
    const violations = findViolationsInSource(
      '<button className="h-8 w-8 rounded-full" onClick={fn}>x</button>'
    );
    expect(violations).toHaveLength(1);
  });

  it('RED: flags sub-44px arbitrary pixel heights', () => {
    expect(
      findViolationsInSource('<a role="button" className="h-[32px]">x</a>')
    ).toHaveLength(1);
  });

  it('RED: flags size-* utilities below 44px', () => {
    expect(
      findViolationsInSource('<button className="size-9 shrink-0">x</button>')
    ).toHaveLength(1);
  });

  it('GREEN: a 44px-tall control passes', () => {
    expect(
      findViolationsInSource('<button className="h-11 px-4">x</button>')
    ).toHaveLength(0);
  });

  it('GREEN: min-h-11 rescues a compact visual height', () => {
    expect(
      findViolationsInSource('<button className="h-8 min-h-11 w-8">x</button>')
    ).toHaveLength(0);
  });

  it('GREEN: arbitrary ≥44px rescue works', () => {
    expect(
      findViolationsInSource('<button className="h-6 min-h-[44px]">x</button>')
    ).toHaveLength(0);
  });

  it('GREEN: elements without explicit heights are not flagged (padding-based sizing)', () => {
    expect(
      findViolationsInSource('<button className="px-3 py-2">x</button>')
    ).toHaveLength(0);
  });

  it('GREEN: non-interactive elements are ignored', () => {
    expect(
      findViolationsInSource('<div className="h-8 w-8">decoration</div>')
    ).toHaveLength(0);
  });

  it('handles multi-line JSX openings with expression props', () => {
    const src = [
      '<button',
      '  className={cn("h-8 w-8", isActive && "bg-surface-2")}',
      '  onClick={() => toggle(a > b)}',
      '>',
    ].join('\n');
    expect(findViolationsInSource(src)).toHaveLength(1);
  });

  it('tagHasSub44Height is precise about the 44px boundary', () => {
    expect(tagHasSub44Height('<button className="h-10">')).toBe(true); // 40px
    expect(tagHasSub44Height('<button className="h-11">')).toBe(false); // 44px
    expect(tagHasSub44Height('<button className="h-[43px]">')).toBe(true);
    expect(tagHasSub44Height('<button className="h-[44px]">')).toBe(false);
  });
});
