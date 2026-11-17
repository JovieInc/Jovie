import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareHtml } from './render-html.mjs';

test('prepareHtml: local fonts replace Google Fonts, relative images resolve', () => {
  const html = `<html><head><link rel="preconnect" href="https://fonts.googleapis.com" /><link href="https://fonts.googleapis.com/css2?family=Inter%3Awght%40100..900&display=swap" rel="stylesheet" /><link href="https://fonts.googleapis.com/css2?family=Fraunces&display=swap" rel="stylesheet" /></head><body><div style="background-image: url('generated-58.png')"></div><img src="a b.png"></body></html>`;
  const out = prepareHtml(html, {
    assetBase: '/ws',
    fontDir: '/fonts',
    localFonts: { Inter: { file: 'Inter.woff2', weight: '100 900' } },
  });
  assert.doesNotMatch(out, /family=Inter/);
  assert.match(out, /family=Fraunces&display=block/);
  assert.match(out, /url\('file:\/\/\/ws\/generated-58\.png'\)/);
  assert.match(out, /src="file:\/\/\/ws\/a%20b\.png"/);
});

test('SVG gradients, masks and clip-paths retain fragment references', () => {
  const html = prepareHtml(
    '<head></head><svg><path fill="url(#gradient)" mask="url(\'#mask\')" clip-path="url(#clip)"/></svg>',
    { assetBase: '/workspace', localFonts: {} }
  );
  assert.match(html, /url\(#gradient\)/);
  assert.match(html, /url\('#mask'\)/);
  assert.match(html, /url\(#clip\)/);
  assert.doesNotMatch(html, /file:/);
});
