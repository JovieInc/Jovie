import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { evaluateRepoHygiene } from '../../repo-hygiene-guard.mjs';
import {
  findOrphanReviewImages,
  gitFilesContaining,
  isReviewImage,
} from '../orphan-screenshot-guard.mjs';

const roots = [];
afterEach(() => {
  while (roots.length) rmSync(roots.pop(), { force: true, recursive: true });
});

// Fixture tree: { 'path/to/file': 'contents' }. Images get a stub payload.
function fixture(files, { git = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'orphan-shots-'));
  roots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), contents);
  }
  if (git) {
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['add', '-A'], { cwd: root });
  }
  return { root, trackedPaths: Object.keys(files) };
}

const orphansIn = (files, options) => {
  const { root, trackedPaths } = fixture(files);
  return findOrphanReviewImages({
    root,
    trackedPaths,
    filesContaining: () => null,
    ...options,
  }).map(error => error.split(':')[0]);
};

const PNG = 'png-bytes';

describe('isReviewImage', () => {
  it('covers both review roots and every image extension, any case', () => {
    for (const path of [
      'docs/screenshots/a.png',
      'docs/screenshots/x/b.JPG',
      'docs/screenshots/c.jpeg',
      'docs/pen-stills/home/390/d.webp',
      'docs/pen-stills/e.gif',
    ])
      assert.equal(isReviewImage(path), true, path);
    for (const path of [
      'docs/screenshots/README.md',
      'docs/screenshots/x/capture.json',
      'apps/web/public/a.png',
      'docs/other/a.png',
    ])
      assert.equal(isReviewImage(path), false, path);
  });
});

describe('findOrphanReviewImages', () => {
  it('skips the scan entirely when no review image is tracked', () => {
    let scanned = false;
    const errors = findOrphanReviewImages({
      trackedPaths: ['README.md', 'apps/web/public/logo.png'],
      filesContaining: () => {
        scanned = true;
        return [];
      },
    });
    assert.deepEqual(errors, []);
    assert.equal(scanned, false);
  });

  it('accepts a full-path, relative, URL or bare file-name reference', () => {
    const orphans = orphansIn({
      'docs/screenshots/jov-1/full.png': PNG,
      'docs/screenshots/jov-1/relative.png': PNG,
      'docs/screenshots/jov-1/url.png': PNG,
      'docs/screenshots/jov-1/bare.png': PNG,
      'docs/pen-stills/home/390/hero.PNG': PNG,
      'canon/DESIGN.md': [
        '![full](docs/screenshots/jov-1/full.png)',
        '[rel](../docs/screenshots/jov-1/relative.png)',
        'https://github.com/o/r/blob/main/docs/screenshots/jov-1/url.png',
      ].join('\n'),
      'apps/web/a.ts': "const file = `${dir}/bare.png`;\nload('hero.PNG');",
    });
    assert.deepEqual(orphans, []);
  });

  it('fails an image only its own folder mentions', () => {
    const orphans = orphansIn({
      'docs/screenshots/jov-2/README.md': '![after](after.png)',
      'docs/screenshots/jov-2/after.png': PNG,
      'docs/screenshots/loose.png': PNG,
    });
    assert.deepEqual(orphans, [
      'docs/screenshots/jov-2/after.png',
      'docs/screenshots/loose.png',
    ]);
  });

  it('does not let a different folder path stand in for the image', () => {
    const orphans = orphansIn({
      'docs/screenshots/jov-3/after.png': PNG,
      'docs/notes.md': 'see docs/screenshots/jov-4/after.png',
    });
    assert.deepEqual(orphans, ['docs/screenshots/jov-3/after.png']);
  });

  it('ignores mentions inside other images', () => {
    const orphans = orphansIn({
      'docs/screenshots/a.png': PNG,
      'docs/screenshots/x/b.png': 'docs/screenshots/a.png',
    });
    assert.deepEqual(orphans, [
      'docs/screenshots/a.png',
      'docs/screenshots/x/b.png',
    ]);
  });

  it('keeps a sibling-listed image when the folder is named from outside', () => {
    const orphans = orphansIn({
      'docs/screenshots/pricing-1109/capture.json':
        '{"shots":[{"file":"_pricing-1440.png"}]}',
      'docs/screenshots/pricing-1109/_pricing-1440.png': PNG,
      'docs/screenshots/pricing-1109/unlisted.png': PNG,
      'apps/web/data/census.json':
        '{"ref":"Evidence: docs/screenshots/pricing-1109/."}',
      'docs/screenshots/holdout/holdout.json': '{"caseId":"esc-1.png"}',
      'docs/screenshots/holdout/esc-1.png': PNG,
      'scripts/holdout.test.mjs': "join(here, '../docs/screenshots/holdout')",
    });
    assert.deepEqual(orphans, ['docs/screenshots/pricing-1109/unlisted.png']);
  });

  it('needs the folder named exactly, from outside the folder', () => {
    const orphans = orphansIn({
      'docs/screenshots/jov-1/README.md': 'after.png (screenshots/jov-1)',
      'docs/screenshots/jov-1/after.png': PNG,
      'docs/screenshots/jov-1/sub/notes.md': 'screenshots/jov-1',
      'docs/index.md': 'screenshots/jov-10 and screenshots/jov-1-old',
    });
    assert.deepEqual(orphans, ['docs/screenshots/jov-1/after.png']);
  });

  it('never treats a review root as a bundle (Seer review on #25014)', () => {
    // Policy prose names docs/screenshots and docs/pen-stills all the time;
    // that must not keep a root-level image that only a root README lists.
    const orphans = orphansIn({
      'docs/screenshots/README.md': '![old](stale.png)',
      'docs/screenshots/stale.png': PNG,
      'docs/pen-stills/README.md': 'see old.webp',
      'docs/pen-stills/old.webp': PNG,
      'docs/ci/repository-health.md':
        'Images under docs/screenshots and docs/pen-stills must be referenced.',
    });
    assert.deepEqual(orphans, [
      'docs/pen-stills/old.webp',
      'docs/screenshots/stale.png',
    ]);
  });

  it("a bare name in one review folder never keeps another folder's image (Seer review on #25014)", () => {
    // pricing-390.jpg exists in two bundles; only one bundle lists it.
    const orphans = orphansIn({
      'docs/screenshots/audit-1029/README.md': '![m](pricing-390.jpg)',
      'docs/screenshots/audit-1029/pricing-390.jpg': PNG,
      'docs/screenshots/recert-1029/pricing-390.jpg': PNG,
      'docs/ci/census.md': 'Evidence: docs/screenshots/audit-1029',
      // Outside the review roots a bare file name still counts everywhere.
      'docs/screenshots/recert-1109/pricing-1440.jpg': PNG,
      'apps/web/data/census.json': '{"shot":"pricing-1440.jpg"}',
    });
    assert.deepEqual(orphans, ['docs/screenshots/recert-1029/pricing-390.jpg']);
  });

  it('a ../ reference from a bundle README keeps the parent image (Seer review on #25121)', () => {
    const orphans = orphansIn({
      'docs/screenshots/jov-9/README.md':
        '![a](after.png) ![shared](../shared.png)',
      'docs/screenshots/jov-9/after.png': PNG,
      'docs/screenshots/shared.png': PNG,
      'docs/ci/census.md': 'Evidence: docs/screenshots/jov-9',
    });
    assert.deepEqual(orphans, []);
  });

  it("a ./ link in one review folder never keeps another folder's image (Seer review on #25126)", () => {
    const orphans = orphansIn({
      'docs/screenshots/jov-7/README.md': '![a](./after.png)',
      'docs/screenshots/jov-7/after.png': PNG,
      'docs/screenshots/jov-8/after.png': PNG,
      'docs/ci/census.md': 'Evidence: docs/screenshots/jov-7',
    });
    assert.deepEqual(orphans, ['docs/screenshots/jov-8/after.png']);
  });

  it('a ../ link resolves to one file, never a same-named image in another bundle (Seer review on #25126)', () => {
    const orphans = orphansIn({
      'docs/screenshots/jov-9/README.md':
        '![a](after.png) ![s](../shared/hero.png)',
      'docs/screenshots/jov-9/after.png': PNG,
      'docs/screenshots/shared/hero.png': PNG,
      'docs/screenshots/jov-10/shared/hero.png': PNG,
      'docs/ci/census.md': 'Evidence: docs/screenshots/jov-9',
    });
    assert.deepEqual(orphans, ['docs/screenshots/jov-10/shared/hero.png']);
  });

  it('names the policy doc and where PR evidence belongs', () => {
    const { root, trackedPaths } = fixture({ 'docs/screenshots/a.png': PNG });
    const [error] = findOrphanReviewImages({
      root,
      trackedPaths,
      filesContaining: () => [],
    });
    assert.match(error, /^docs\/screenshots\/a\.png: /);
    assert.match(error, /on the PR \(attachment or CI artifact\)/);
    assert.match(error, /docs\/ci\/repository-health\.md/);
  });
});

describe('git-backed scan', () => {
  it('prefilters tracked files with git grep and ignores untracked ones', () => {
    const { root } = fixture(
      {
        'docs/screenshots/jov-5/kept.png': PNG,
        'docs/screenshots/jov-5/dropped.png': PNG,
        'docs/guide.md': '![kept](screenshots/jov-5/kept.png)',
      },
      { git: true }
    );
    writeFileSync(join(root, 'untracked.md'), 'jov-5/dropped.png');
    assert.deepEqual(gitFilesContaining(root, ['.png']).sort(), [
      'docs/guide.md',
    ]);
    const trackedPaths = execFileSync('git', ['ls-files'], {
      cwd: root,
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean);
    assert.deepEqual(
      findOrphanReviewImages({ root, trackedPaths }).map(
        error => error.split(':')[0]
      ),
      ['docs/screenshots/jov-5/dropped.png']
    );
  });

  it('returns null outside a git checkout and [] when nothing matches', () => {
    const { root: plain } = fixture({ 'a.md': 'x' });
    assert.equal(gitFilesContaining(plain, ['.png']), null);
    const { root: repo } = fixture({ 'a.md': 'x' }, { git: true });
    assert.deepEqual(gitFilesContaining(repo, ['.png']), []);
  });

  it('falls back to reading tracked text files without git', () => {
    const { root, trackedPaths } = fixture({
      'docs/screenshots/a.png': PNG,
      'docs/b.md': 'docs/screenshots/a.png',
    });
    assert.deepEqual(findOrphanReviewImages({ root, trackedPaths }), []);
  });
});

describe('repo hygiene wiring', () => {
  it('blocks an orphan review image through evaluateRepoHygiene', () => {
    const { root, trackedPaths } = fixture({
      'docs/screenshots/jov-9/evidence.png': PNG,
    });
    const result = evaluateRepoHygiene({
      addedPaths: [],
      root,
      trackedPaths,
    });
    assert.ok(
      result.errors.some(error =>
        error.startsWith(
          'docs/screenshots/jov-9/evidence.png: unreferenced review image'
        )
      ),
      result.errors.join('\n')
    );
  });
});
