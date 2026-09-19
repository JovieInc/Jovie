import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as blockingUiInvariants from './blocking-ui-invariants';

type Violation = blockingUiInvariants.Violation;

const {
  REPO_ROOT,
  WEB_ROOT,
  formatViolations,
  jsxOpenings,
  lineOf,
  read,
  repoPath,
  requireDir,
  walkSource,
} = blockingUiInvariants;

/**
 * mac-header-two-lines-v1 (Tim lock 2026-08-30,
 * gbrain ops/reviewed-invariants/blocking-ui-invariants-v1).
 *
 * Mac headers wrap at 2 lines max.
 *
 * The Jovie Mac desktop app (apps/desktop) is a thin Electron wrapper over
 * the hosted web app shell, so Mac headers ARE the web shell headers. On a
 * narrow Mac window an unclamped <h1>/<h2> wraps unbounded — exactly the
 * miss this invariant bans.
 *
 * Detector (source contract, fail closed): every <h1>/<h2> opening tag in
 * the surfaces the Mac app renders — the app shell (components/shell/**,
 * app/app/**) AND the marketing pages (Tim add 2026-08-30: marketing routes
 * and components are in scope for the blocking layout tests) — must carry
 * an explicit wrap bound: `line-clamp-1`, `line-clamp-2`, `truncate`, or be
 * `sr-only`. Anything else can exceed two lines and is red. No baseline,
 * no blanket allowlist. The 2026-09-14 founder correction keeps editorial
 * card titles complete with an explicit, per-row subgrid contract below.
 */

const CLAMP_BOUND = /(line-clamp-1|line-clamp-2|truncate|sr-only)/;
const NON_PRODUCT = /\.(test|spec|stories)\.[jt]sx?$/;

/** Full editorial titles are intentional; all other shell headings remain bounded. */
function hasEditorialTitleContract(
  file: string,
  attrs: string,
  source: string
): boolean {
  return (
    file === 'apps/web/app/(marketing)/blog/components/BlogCard.tsx' &&
    /data-wrap=['"]editorial-title['"]/.test(attrs) &&
    !CLAMP_BOUND.test(attrs) &&
    /row-span-3 grid[^'"\n]*grid-rows-subgrid/.test(source) &&
    /row-span-2 grid[^'"\n]*grid-rows-subgrid/.test(source)
  );
}

function shellSurfaceFiles(): string[] {
  const roots = [
    join(WEB_ROOT, 'components', 'shell'),
    join(WEB_ROOT, 'app', 'app'),
    // Marketing surfaces (in scope per Tim, 2026-08-30).
    join(WEB_ROOT, 'app', '(marketing)'),
    join(WEB_ROOT, 'app', '(home)'),
    join(WEB_ROOT, 'components', 'marketing'),
    join(WEB_ROOT, 'components', 'site'),
    join(WEB_ROOT, 'components', 'features', 'home'),
  ];
  for (const root of roots) requireDir(root, relative(REPO_ROOT, root));
  const files: string[] = [];
  for (const root of roots) walkSource(root, /\.tsx$/, files);
  const product = files
    .filter(file => !NON_PRODUCT.test(file))
    .sort((a, b) => a.localeCompare(b));
  if (product.length === 0) {
    throw new Error(
      '[mac-header-two-lines-v1] zero shell surface files scanned — detector is blind, failing closed'
    );
  }
  return product;
}

describe('mac-header-two-lines-v1', () => {
  it('requires the full-title marker and both shared grid tracks only on the editorial card', () => {
    const file = 'apps/web/app/(marketing)/blog/components/BlogCard.tsx';
    const attrs = "data-wrap='editorial-title'";
    const tracks =
      'row-span-3 grid grid-rows-subgrid; row-span-2 grid grid-rows-subgrid';
    expect(hasEditorialTitleContract(file, attrs, tracks)).toBe(true);
    expect(
      hasEditorialTitleContract(
        'apps/web/components/shell/Header.tsx',
        attrs,
        tracks
      )
    ).toBe(false);
    expect(hasEditorialTitleContract(file, '', tracks)).toBe(false);
    expect(hasEditorialTitleContract(file, attrs, 'grid')).toBe(false);
    expect(
      hasEditorialTitleContract(
        file,
        attrs,
        'row-span-3 grid grid-rows-subgrid'
      )
    ).toBe(false);
    expect(
      hasEditorialTitleContract(
        file,
        `${attrs} className='line-clamp-2'`,
        tracks
      )
    ).toBe(false);
  });

  it('every shell heading carries its bounded or full-editorial-title layout contract', () => {
    const files = shellSurfaceFiles();
    expect(files.length).toBeGreaterThan(0);

    const violations: Violation[] = [];
    for (const file of files) {
      const source = read(file);
      for (const opening of jsxOpenings(source, /h[12]/)) {
        if (!/^h[12]$/.test(opening.tag)) continue;
        if (CLAMP_BOUND.test(opening.attrs)) continue;
        if (hasEditorialTitleContract(repoPath(file), opening.attrs, source))
          continue;
        violations.push({
          file: repoPath(file),
          detail: `<${opening.tag}> at L${lineOf(source, opening.index)} has no line-clamp-1/line-clamp-2/truncate — header can wrap past 2 lines on Mac`,
        });
      }
    }

    expect
      .soft(violations, formatViolations('mac-header-two-lines-v1', violations))
      .toEqual([]);
    expect(violations).toHaveLength(0);
  });
});
