import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  briefFailures,
  check,
  demoArtistFailures,
  homepageSurfaceFailures,
  stockPhraseFailures,
} from './no-invented-customer.mjs';
import { REPO_ROOT } from './paths.mjs';

const SHIPPED = `
  name: 'Ivo Lindqvist',
  handle: 'ivolindqvist',
  profileDisplay: 'jov.ie/ivolindqvist',
  byline: 'Club Mix · Ivo Lindqvist',
`;

const LABELED = `
  name: 'Example artist',
  handle: 'example',
  profileDisplay: 'jov.ie/example',
  byline: 'Example artist',
`;

describe('ASR-033 invented customers', () => {
  it('rejects the personal name and verified badge that shipped', () => {
    const failures = demoArtistFailures(SHIPPED);
    assert.ok(failures.some(line => /Ivo Lindqvist/u.test(line)));
    assert.ok(failures.some(line => /ivolindqvist/u.test(line)));
    assert.ok(
      homepageSurfaceFailures(
        "import { CircleCheck } from 'lucide-react'",
        'ProductUi.tsx'
      ).length > 0
    );
    assert.ok(
      stockPhraseFailures("subhead: 'in one quiet workspace.'", 'copy.ts')
        .length > 0
    );
    assert.ok(
      homepageSurfaceFailures(
        '.hv3-chapter > .hv3-rule::before { content: ""; }',
        'cinema.css'
      ).some(line => /registration cross/u.test(line))
    );
    assert.ok(
      homepageSurfaceFailures('background-clip: text;', 'cinema.css').some(
        line => /gradient/u.test(line)
      )
    );
  });

  it('accepts a labeled example artist', () => {
    assert.deepEqual(demoArtistFailures(LABELED), []);
  });

  it('rejects a pen brief that requires the costume', () => {
    const failures = briefFailures(
      'small registration crosses where section rules meet them. Headlines fall off from primary ink. The invented demo artist.'
    );
    assert.equal(failures.length, 4);
  });

  it('passes the homepage as it stands', () => {
    assert.deepEqual(check(REPO_ROOT).failures, []);
  });
});
