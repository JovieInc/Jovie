import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ALLOWED_METHODS,
  recolorIds,
  resolveImage,
  ungradedRatchet,
  validateManifest,
} from './marketing-image-grading.mjs';

const scanned = new Map([['apps/web/public/a.webp', ['x.tsx']]]);
const entry = (over = {}) => ({
  path: 'apps/web/public/a.webp',
  pages: ['x.tsx'],
  status: 'ungraded',
  method: null,
  gradedBy: null,
  gradedAt: null,
  ...over,
});

describe('manifest', () => {
  it('passes when every referenced image is listed', () => {
    assert.deepEqual(validateManifest({ images: [entry()] }, scanned), []);
  });
  it('fails a new marketing image that is not in the manifest', () => {
    const f = validateManifest({ images: [] }, scanned);
    assert.match(f[0], /not in the grading manifest/);
  });
  it('fails a stale entry', () => {
    const f = validateManifest(
      { images: [entry(), entry({ path: 'apps/web/public/gone.webp' })] },
      scanned
    );
    assert.match(f.join('\n'), /no marketing page references/);
  });
  it('accepts a graded image with the allowed method, who and when', () => {
    const e = entry({
      status: 'graded-hue',
      method: ALLOWED_METHODS['graded-hue'],
      gradedBy: 'designer',
      gradedAt: '2026-11-22',
    });
    assert.deepEqual(validateManifest({ images: [e] }, scanned), []);
    const r = entry({
      status: 'regenerated',
      method: ALLOWED_METHODS.regenerated,
      gradedBy: 'imagegen',
      gradedAt: '2026-11-22',
    });
    assert.deepEqual(validateManifest({ images: [r] }, scanned), []);
  });
  it('bans LUTs, blanket filters and unknown methods', () => {
    for (const method of [
      'LUT applied',
      'blanket filter',
      'css hue-rotate',
      'quick tweak',
    ]) {
      const e = entry({
        status: 'graded-hue',
        method,
        gradedBy: 'x',
        gradedAt: '2026-11-22',
      });
      assert.ok(validateManifest({ images: [e] }, scanned).length > 0, method);
    }
  });
  it('requires who and when on a graded image', () => {
    const e = entry({
      status: 'graded-hue',
      method: ALLOWED_METHODS['graded-hue'],
    });
    assert.equal(validateManifest({ images: [e] }, scanned).length, 2);
  });
});

describe('ungraded ratchet', () => {
  it('fails when a new image arrives ungraded', () => {
    const f = ungradedRatchet(
      { images: [entry(), entry({ path: 'b.webp' })] },
      { images: [entry()] }
    );
    assert.equal(f.length, 1);
  });
  it('passes when the ungraded set shrinks or stays', () => {
    const graded = entry({
      status: 'graded-hue',
      method: ALLOWED_METHODS['graded-hue'],
      gradedBy: 'x',
      gradedAt: '2026-11-22',
    });
    assert.deepEqual(
      ungradedRatchet({ images: [graded] }, { images: [entry()] }),
      []
    );
    assert.deepEqual(
      ungradedRatchet({ images: [entry()] }, { images: [entry()] }),
      []
    );
  });
});

describe('image resolution', () => {
  it('ignores remote and bare references', () => {
    assert.equal(resolveImage('https://x.test/a.png', 'a.tsx'), null);
    assert.equal(resolveImage('a.png', 'a.tsx'), null);
  });
});

describe('recolor ban', () => {
  const file = 'apps/web/components/marketing/Hero.tsx';
  it('fails CSS filter, hue-rotate and blend recolor on img elements', () => {
    assert.equal(
      recolorIds(
        `export const A = () => <img src="/a.png" className="hue-rotate-90" />;`,
        file
      ).length,
      1
    );
    assert.equal(
      recolorIds(
        `export const A = () => <Image src={x} className="saturate-150 mix-blend-screen" />;`,
        file
      ).length,
      1
    );
    assert.equal(
      recolorIds(
        `export const A = () => <picture style={{ filter: 'sepia(1)' }} />;`,
        file
      ).length,
      1
    );
  });
  it('passes an untouched image and non-image elements', () => {
    assert.deepEqual(
      recolorIds(
        `export const A = () => <img src="/a.png" className="rounded-xl w-full" />;`,
        file
      ),
      []
    );
    assert.deepEqual(
      recolorIds(
        `export const A = () => <div className="hue-rotate-90" />;`,
        file
      ),
      []
    );
  });
  it('fails CSS filter on image selectors and passes none and blur', () => {
    const css = 'apps/web/components/marketing/hero.css';
    assert.equal(
      recolorIds('.hero img { filter: hue-rotate(40deg); }', css).length,
      1
    );
    assert.equal(
      recolorIds('.hero-photo { mix-blend-mode: color; }', css).length,
      1
    );
    assert.deepEqual(recolorIds('.hero img { filter: none; }', css), []);
    assert.deepEqual(recolorIds('.hero img { filter: blur(4px); }', css), []);
  });
});
