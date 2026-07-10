import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');
const pagePath = 'app/(home)/page.tsx';
const cssPath = 'app/(home)/home.css';

describe('mounted homepage product statement System B source contract', () => {
  it('keeps the retired product statement source and CSS out of the homepage', () => {
    const page = readFileSync(path.join(webRoot, pagePath), 'utf8');
    const css = readFileSync(path.join(webRoot, cssPath), 'utf8');

    expect(page).not.toContain('HomepageProductStatement');
    expect(page).not.toContain('system-b-mounted-home-product-statement');
    expect(css).not.toContain('SYSTEM B MOUNTED HOME PRODUCT STATEMENT');
    expect(css).not.toContain('system-b-mounted-home-product-statement');
  });
});
