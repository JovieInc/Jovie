import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  checkRounded,
  classifyRadiusValue,
  isRawArbitraryRadius,
  isRoundedClass,
  scanSources,
} from './rounded.mjs';

describe('marketing rounded media', () => {
  it('classifies token, raw, square, and already-round radii', () => {
    for (const value of [
      'var(--radius-xl)',
      'var(--system-b-radius-panel)',
      'min(var(--radius-3xl), 8cqi)',
      'var(--profile-inner-radius)',
    ]) {
      assert.equal(classifyRadiusValue(value), 'token', value);
    }
    assert.equal(classifyRadiusValue('1.45rem'), 'raw');
    assert.equal(classifyRadiusValue('0'), 'zero');
    assert.equal(isRoundedClass('marketing-rounded-frame'), true);
    assert.equal(isRoundedClass('md:rounded-xl'), true);
    assert.equal(isRoundedClass('rounded-none'), false);
    assert.equal(isRoundedClass('rounded-[var(--radius-xl)]'), true);
    assert.equal(isRawArbitraryRadius('rounded-[1.1rem]'), true);
    assert.equal(isRawArbitraryRadius('rounded-[inherit]'), false);
  });

  it('matches images and cards, and exempts full-bleed, logos, and round avatars', () => {
    const file = 'apps/web/components/marketing/Fixture.tsx';
    const css =
      '.shot{border-radius:var(--radius-xl);overflow:hidden}.raw-card{border-radius:1.45rem;background:black}.square-card{border-radius:0;background:black}.photo{background-image:url("/hero.jpg")}.frame-skin{background-image:url("data:image/svg+xml,abc")}';
    const { ids } = scanSources([
      { path: 'apps/web/components/marketing/fixture.css', source: css },
      {
        path: file,
        source: `
          <section className="marketing-hero-dock"><Image alt="" /></section>
          <img alt="Jovie logo" /><img className="avatar rounded-full" alt="" />
          <Image className="official-iphone-frame__bezel" alt="" />
          <ArtistProfilePhoneFrame><Image alt="" /></ArtistProfilePhoneFrame>
          <div className="shot"><Image alt="" /></div>
          <div className="marketing-rounded-frame"><Image alt="" /></div>
          <article className="marketing-pricing-plan-card"></article>
          <div className="raw-card"></div>
          <article className="square-card"></article>
          <div className="rounded-xl"><article className="inset-card"></article></div>
          <div className="rounded-[1.1rem]"></div>
        `,
      },
    ]);
    assert.deepEqual(
      ids,
      [
        `raw:${file}:9:card:raw-card`,
        `raw:${file}:12:card:rounded-[1.1rem]`,
        `square:${file}:10:card:square-card`,
        `square:${file}:11:card:inset-card`,
        `square:${file}:8:card:marketing-pricing-plan-card`,
        'square:apps/web/components/marketing/fixture.css:0:image:photo',
      ].sort()
    );
  });

  it('rejects violations even when a baseline records them as allowed', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rounded-media-'));
    try {
      const directory = join(root, 'apps/web/components/marketing');
      mkdirSync(directory, { recursive: true });
      writeFileSync(
        join(directory, 'Fixture.tsx'),
        '<article className="square-card"><img alt="Artist" /></article>'
      );
      const first = await checkRounded(root);
      assert.equal(first.count, 2);
      assert.equal(first.failures.length, 1);
      for (const id of first.ids) assert.ok(first.failures[0].includes(id));

      const baseline = join(root, 'scripts/invariants/art-direction');
      mkdirSync(baseline, { recursive: true });
      writeFileSync(
        join(baseline, 'rounded.baseline.json'),
        JSON.stringify({ count: first.count, ids: first.ids })
      );
      assert.deepEqual(await checkRounded(root), first);

      writeFileSync(
        join(directory, 'Fixture.tsx'),
        '<article className="marketing-rounded-frame"><img alt="Artist" /></article>'
      );
      const fixed = await checkRounded(root);
      assert.equal(fixed.count, 0);
      assert.deepEqual(fixed.failures, []);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('has zero violations in the repository', async () => {
    const { failures, count } = await checkRounded();
    assert.deepEqual(failures, [], failures.join('\n'));
    assert.equal(count, 0);
  });
});
