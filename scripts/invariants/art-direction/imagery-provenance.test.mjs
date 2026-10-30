import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scanSources } from './imagery-provenance.mjs';

const at = path => ({ path: `apps/web/components/marketing/${path}` });

describe('imagery provenance', () => {
  it('passes pipeline components and svg', () => {
    const { ids } = scanSources([
      {
        ...at('Section.tsx'),
        source:
          "import { ProductShot } from './ProductShot';\n<ProductShot id='setup-claim-handle' />\n.logo{background:url('/logo.svg')}",
      },
    ]);
    assert.deepEqual(ids, []);
  });

  it('exempts the pipeline renderers themselves', () => {
    const { ids } = scanSources([
      { ...at('ProductShot.tsx'), source: '<img src={shot.webp} />' },
    ]);
    assert.deepEqual(ids, []);
  });

  it('fails raw imagery that bypasses the pipeline (deliberate red)', () => {
    const { ids } = scanSources([
      {
        ...at('Hero.tsx'),
        source:
          "import Image from 'next/image';\n<img src='/hero.png'/>\nconst p='/assets/generated/x.webp';\nconst s='/product-shots/a.webp'",
      },
      { ...at('hero.css'), source: ".a{background-image:url('/bg.jpg')}" },
    ]);
    assert.deepEqual(ids, [
      'apps/web/components/marketing/Hero.tsx#img-tag',
      'apps/web/components/marketing/Hero.tsx#next-image',
      'apps/web/components/marketing/Hero.tsx#plate-literal',
      'apps/web/components/marketing/Hero.tsx#screenshot-literal',
      'apps/web/components/marketing/hero.css#css-raster-url',
    ]);
  });

  it('ignores commented-out imagery', () => {
    const { ids } = scanSources([
      { ...at('A.tsx'), source: "// <img src='/a.png'/>\n/* url(/a.png) */" },
    ]);
    assert.deepEqual(ids, []);
  });
});
