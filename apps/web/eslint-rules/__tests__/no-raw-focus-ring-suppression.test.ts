import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { findBannedFocusClasses } = require('../no-raw-focus-ring.js');

describe('no-raw-focus-ring: focus-visible suppression guard', () => {
  it('flags ring-0 on buttons/links with no focus-visible replacement', () => {
    expect(
      findBannedFocusClasses('outline-none focus-visible:ring-0', true)
    ).not.toBeNull();
    expect(
      findBannedFocusClasses('focus-visible:shadow-none px-2', true)
    ).not.toBeNull();
  });

  it('allows suppression when a focus-visible replacement exists', () => {
    expect(
      findBannedFocusClasses(
        'focus-visible:ring-0 focus-visible:bg-surface-1',
        true
      )
    ).toBeNull();
    expect(
      findBannedFocusClasses('outline-none focus-visible:ring-2', true)
    ).toBeNull();
  });

  it('does not flag text-entry fields owned by a focus-within wrapper', () => {
    expect(
      findBannedFocusClasses('border-0 focus-visible:ring-0', false)
    ).toBeNull();
  });
});

describe('globals.css default focus-visible layer', () => {
  it('applies Tailwind focus-visible ring utilities to every interactive element', () => {
    const css = readFileSync(
      path.join(__dirname, '../../app/globals.css'),
      'utf8'
    );
    const start = css.indexOf('DEFAULT FOCUS-VISIBLE');
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start);
    for (const selector of [
      'a[href]',
      'button',
      '[role="button"]',
      '[tabindex]:not([tabindex="-1"])',
      'input:not([type="hidden"])',
      'textarea',
      'select',
    ]) {
      expect(block).toContain(selector);
    }
    expect(block).toMatch(
      /@apply[^;]*focus-visible:ring-2[^;]*focus-visible:ring-offset-2/
    );
    expect(block).not.toMatch(/(^|\s)focus:ring/);
  });
});
