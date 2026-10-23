import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  checkContainerWidth,
  GUIDANCE,
  maxWidthProblem,
  scanSources,
  toRem,
} from './container-width.mjs';
import { evaluateRatchet } from './ratchet.mjs';

const FILE = 'apps/web/components/marketing/Fixture.tsx';
const scan = (source, path = FILE) => scanSources([{ path, source }]).ids;

describe('marketing container width', () => {
  it('reads lengths and tells a page width from a reading measure', () => {
    assert.equal(toRem('75rem'), 75);
    assert.equal(toRem('768px'), 48);
    assert.equal(maxWidthProblem('max-w-public-content'), null);
    assert.equal(maxWidthProblem('max-w-prose-canonical'), null);
    assert.equal(maxWidthProblem('lg:max-w-none'), null);
    assert.equal(maxWidthProblem('max-w-3xl'), null);
    assert.equal(maxWidthProblem('max-w-xl'), null);
    assert.equal(maxWidthProblem('max-w-[34rem]'), null);
    assert.equal(maxWidthProblem('max-w-[20ch]'), null);
    assert.equal(
      maxWidthProblem('max-w-[min(100vw,var(--phone-frame))]'),
      null
    );
    assert.equal(maxWidthProblem('max-w-4xl'), 'page-width');
    assert.equal(maxWidthProblem('md:max-w-6xl'), 'page-width');
    assert.equal(maxWidthProblem('max-w-300'), 'page-width');
    assert.equal(maxWidthProblem('max-w-[80rem]'), 'page-width');
    assert.equal(maxWidthProblem('max-w-screen-xl'), 'viewport-width');
    assert.equal(maxWidthProblem('max-w-linear-content'), 'second-token');
    assert.equal(
      maxWidthProblem('max-w-[var(--homepage-section-max,80rem)]'),
      'second-token'
    );
  });

  it('flags a rogue page width and the container class, and passes the token', () => {
    assert.deepEqual(scan("<div className='mx-auto max-w-5xl' />"), [
      `${FILE}|page-width|max-w-5xl`,
    ]);
    assert.deepEqual(
      scan("const SHELL = cn('container mx-auto', open && 'max-w-7xl');"),
      [`${FILE}|container-class|container`, `${FILE}|page-width|max-w-7xl`]
    );
    assert.deepEqual(
      scan("<div className='mx-auto max-w-public-content' />"),
      []
    );
    assert.deepEqual(
      scan("<p className='mx-auto max-w-2xl text-center' />"),
      []
    );
  });

  it('flags a container that brings its own horizontal padding', () => {
    assert.deepEqual(
      scan("<MarketingContainer width='page' className='px-5 sm:px-6' />"),
      [`${FILE}|gutter|px-5 sm:px-6`]
    );
    assert.deepEqual(scan("<div className='public-container px-4' />"), [
      `${FILE}|gutter|px-4`,
    ]);
    assert.deepEqual(
      scan(
        "<div className='mx-auto max-w-public-content px-5 sm:px-6 lg:px-8' />"
      ),
      [`${FILE}|gutter|lg:px-8 px-5 sm:px-6`]
    );
    assert.deepEqual(
      scan(
        "<div className='mx-auto max-w-public-content px-(--ds-public-gutter)' />"
      ),
      []
    );
    assert.deepEqual(
      scan(
        "<div className='mx-auto max-w-public-content px-6 sm:px-8 lg:px-10' />"
      ),
      []
    );
    assert.deepEqual(
      scan("<MarketingContainer width='page' className='py-16' />"),
      []
    );
    assert.deepEqual(scan("<div className='px-5 sm:px-6' />"), []);
  });

  it('flags a second width token or a wide width in CSS, and allows the token', () => {
    const path = 'apps/web/components/marketing/fixture.css';
    const css = [
      '.a { max-width: 75rem; }',
      '.b { width: min(100%, 106rem); }',
      '.c { max-width: var(--homepage-section-max); }',
      ':root { --homepage-section-max: 90rem; }',
      '.d { max-width: var(--ds-public-content-max); }',
      '.e { max-width: 40rem; }',
      '.f { width: min(100%, 30rem); }',
      '@media (max-width: 767px) { .g { color: red; } }',
    ].join('\n');
    assert.deepEqual(scan(css, path), [
      `${path}|page-width|max-width: 75rem`,
      `${path}|page-width|width: min(100%, 106rem)`,
      `${path}|second-token|--homepage-section-max: 90rem`,
      `${path}|second-token|max-width: var(--homepage-section-max)`,
    ]);
  });

  it('honours a reasoned opt-out and skips the primitives that own the token', () => {
    const path = 'apps/web/components/marketing/fixture.css';
    assert.deepEqual(
      scan(
        '/* container-width-allow: flyout panel */\n.menu { width: min(50rem, 100%); }',
        path
      ),
      []
    );
    assert.deepEqual(
      scan(
        "// container-width-allow: demo frame\n<div className='max-w-5xl' />"
      ),
      []
    );
    assert.deepEqual(
      scan(
        "export const x = 'max-w-5xl public-container px-4';",
        'apps/web/components/marketing/MarketingContainer.tsx'
      ),
      []
    );
  });

  it('numbers repeated hits so the baseline can shrink one at a time', () => {
    assert.deepEqual(
      scan("<a className='max-w-5xl' /><b className='max-w-5xl' />"),
      [`${FILE}|page-width|max-w-5xl`, `${FILE}|page-width|max-w-5xl#2`]
    );
  });

  it('fails new violations and unresolved baseline entries, with guidance', () => {
    const errors = evaluateRatchet({
      current: ['a', 'new'],
      recorded: ['a', 'gone'],
      ancestor: ['a', 'gone'],
    });
    assert.equal(errors.length, 3);
    assert.match(GUIDANCE, /MarketingContainer or Container/);
    assert.match(GUIDANCE, /only override is bleed/);
  });

  it('passes in the repository, and the baseline only shrinks', () => {
    const { failures } = checkContainerWidth();
    assert.deepEqual(failures, [], failures.join('\n'));
  });
});
