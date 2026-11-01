import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  classifyReleasePage,
  diffCatalog,
  extractReleaseLinks,
  normalizeCatalogTitle,
  parseAppleAlbums,
  parseJovieProfileReleases,
} from './check.mjs';

const profileHtml = String.raw`{\"title\":\"Seaside Heights\",\"slug\":\"seaside-heights-3\",\"releaseType\":\"single\",\"releaseDate\":\"2019-09-20T00:00:00.000Z\"}`;

test('normalizes DSP titles to comparable song names', () => {
  assert.equal(
    normalizeCatalogTitle('Seaside Heights - Single'),
    'seasideheights'
  );
  assert.equal(
    normalizeCatalogTitle('Take Me Over (feat. Erica Gibson) - Single'),
    'takemeover'
  );
});

test('parses releases from the profile payload', () => {
  assert.deepEqual(parseJovieProfileReleases(profileHtml), [
    { title: 'Seaside Heights', slug: 'seaside-heights-3', date: '2019-09-20' },
  ]);
});

test('flags a same-title release from another year as missing', () => {
  const jovie = parseJovieProfileReleases(profileHtml);
  const dsp = parseAppleAlbums({
    results: [
      { wrapperType: 'artist' },
      {
        wrapperType: 'collection',
        collectionName: 'Seaside Heights - Single',
        releaseDate: '2019-09-20T07:00:00Z',
        artistName: 'Vigel & Tim White',
        collectionId: 1,
      },
      {
        wrapperType: 'collection',
        collectionName: 'Seaside Heights - Single',
        releaseDate: '2020-05-15T07:00:00Z',
        artistName: 'Tim White',
        collectionId: 2,
      },
    ],
  });
  const missing = diffCatalog(jovie, dsp);
  assert.deepEqual(
    missing.map(m => m.id),
    [2]
  );
});

test('extracts and classifies release links', () => {
  const text =
    'Listen https://jov.ie/tim/seaside-heights and https://jov.ie/tim and https://jov.ie/other/x';
  assert.deepEqual(extractReleaseLinks(text, 'tim'), ['seaside-heights']);
  assert.equal(classifyReleasePage({ status: 404, html: '' }), 'not_found');
  assert.equal(
    classifyReleasePage({
      status: 200,
      html: '<title>Coming soon · Tim White | Jovie</title>',
    }),
    'coming_soon'
  );
  assert.equal(
    classifyReleasePage({
      status: 200,
      html: '<title>Seaside Heights</title>',
    }),
    'live'
  );
});
