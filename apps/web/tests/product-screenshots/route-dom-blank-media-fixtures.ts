import { expect, test } from '@playwright/test';
import {
  busyImg,
  flatImg,
  markupKinds,
  slowImageBlankMedia,
  svg,
} from './route-dom-certification-support';

// Registered by the certification spec so the canonical screenshot runner
// exercises the complete blank-media contract without growing that spec.
export function registerBlankMediaFixtures(): void {
  test('blank-media: flags a near-uniform image in a designed section', async ({
    page,
  }) => {
    expect(
      await markupKinds(
        page,
        `<main><section data-pen-section="hero"><h1>Product</h1><img src="${flatImg}" width="600" height="400" alt="Dashboard"></section></main>`
      )
    ).toContain('blank-media');
  });

  test('blank-media: ignores a busy image and a data-decorative image', async ({
    page,
  }) => {
    expect(
      await markupKinds(
        page,
        `<main><section data-pen-section="hero"><h1>Product</h1><img src="${busyImg}" width="600" height="400" alt="Dashboard"></section></main>`
      )
    ).not.toContain('blank-media');
    expect(
      await markupKinds(
        page,
        `<main><section data-pen-section="hero"><h1>Product</h1><img data-decorative src="${flatImg}" width="600" height="400" alt=""></section></main>`
      )
    ).not.toContain('blank-media');
  });

  test('blank-media: judges a slow image once it has loaded, not its empty slot', async ({
    page,
  }) => {
    expect(await slowImageBlankMedia(page)).not.toContain('blank-media');
  });

  // Measured 2026-11-10 (JOV-12215 family): the loaded /artist-profiles and
  // /blog media read as locally-flat cells yet carry real content — a
  // Noir-Ion product screenshot (21-64% content cells) and chromatic
  // gradient artwork (100% content cells through the luma spread). Blank
  // means no discernible content, not low local variance.
  test('blank-media: passes a dark product screenshot with bright ink once loaded', async ({
    page,
  }) => {
    const darkUi = svg(
      '<rect width="600" height="400" fill="#030407"/>' +
        '<rect x="40" y="40" width="240" height="140" fill="#0f1420" stroke="#1b2436"/>' +
        '<rect x="60" y="60" width="200" height="14" fill="#f5f7fb"/>' +
        '<rect x="60" y="88" width="200" height="10" fill="#a8b0c3"/>' +
        '<rect x="60" y="110" width="160" height="10" fill="#7d879d"/>' +
        '<rect x="360" y="40" width="200" height="280" fill="#151b2a"/>' +
        '<rect x="380" y="60" width="160" height="14" fill="#11afff"/>'
    );
    expect(
      await markupKinds(
        page,
        `<main><section data-pen-section="hero"><h1>Product</h1><img src="${darkUi}" width="600" height="400" alt="Dashboard"></section></main>`
      )
    ).not.toContain('blank-media');
  });

  test('blank-media: passes chromatic gradient artwork that is locally luma-flat', async ({
    page,
  }) => {
    const gradientArt = svg(
      '<defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0">' +
        '<stop offset="0" stop-color="#262627"/><stop offset="1" stop-color="#F52BB5"/>' +
        '</linearGradient></defs><rect width="600" height="400" fill="url(#g)"/>'
    );
    expect(
      await markupKinds(
        page,
        `<main><section data-pen-section="hero"><h1>Product</h1><img src="${gradientArt}" width="600" height="400" alt="Artwork"></section></main>`
      )
    ).not.toContain('blank-media');
  });

  test('blank-media: still flags a speck on an empty field', async ({
    page,
  }) => {
    const speck = svg(
      '<rect width="600" height="400" fill="#ffffff"/>' +
        '<rect x="290" y="190" width="20" height="20" fill="#111111"/>'
    );
    expect(
      await markupKinds(
        page,
        `<main><section data-pen-section="hero"><h1>Product</h1><img src="${speck}" width="600" height="400" alt="Logo"></section></main>`
      )
    ).toContain('blank-media');
  });
}
