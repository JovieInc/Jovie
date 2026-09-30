import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');
const formPath = 'app/(marketing)/product/ProductClaimHandleForm.tsx';

describe('ProductClaimHandleForm domain-prefix contrast', () => {
  it('keeps the jov.ie/ domain prefix on a token that clears WCAG AA', () => {
    const source = readFileSync(path.join(webRoot, formPath), 'utf8');

    // Regression guard: `text-tertiary-token` measured 4.09 (foreground
    // #8f95a0, background #333537) against the editorial input pill's
    // composited background on the homepage close section — fails the
    // required 4.5:1 and broke screenshots.yml's "Capture exact marketing
    // routes" axe pass for `/` (desktop + mobile) on 2026-09-29.
    // `text-secondary-token` (#a0a5af) measures 4.98:1 on the same
    // background. This span is shared by the homepage hero, homepage close,
    // and /product page claim forms, so fixing it here fixes all three.
    expect(source).toMatch(
      /<span className='shrink-0 select-none text-lg text-secondary-token'>/
    );
    expect(source).not.toContain('text-tertiary-token');
  });
});
