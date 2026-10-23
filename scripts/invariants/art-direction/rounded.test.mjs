import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  checkRounded,
  classifyRadiusValue,
  evaluateRatchet,
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

  it('keeps the baseline shrink-only', () => {
    const recorded = ['a', 'b'];
    const run = (current, ancestor, recordedCount) =>
      evaluateRatchet({
        current,
        recorded,
        ancestor,
        recordedCount,
      }).join('\n');
    assert.equal(run(recorded, recorded, 2), '');
    assert.match(run([...recorded, 'c'], null, 2), /missing 1 live id/);
    assert.match(run(['a'], null, 2), /delete 1 resolved id/);
    assert.match(run(recorded, null, 1), /count 1 must equal/);
    const grown = evaluateRatchet({
      current: ['c'],
      recorded: ['c'],
      ancestor: [],
      recordedCount: 1,
    }).join('\n');
    assert.match(grown, /new violations are not allowed/);
    assert.match(grown, /can only go down \(0 -> 1\)/);
  });

  it('matches the committed baseline', async () => {
    const { failures, count } = await checkRounded();
    assert.deepEqual(failures, [], failures.join('\n'));
    assert.equal(count, 0);
  });
});
