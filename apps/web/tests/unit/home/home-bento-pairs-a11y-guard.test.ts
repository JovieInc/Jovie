import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');

describe('HomeBentoPairs dark-surface guard', () => {
  it('keeps the section on the shared dark homepage canvas', () => {
    const componentSource = readFileSync(
      path.join(webRoot, 'components/features/home/HomeBentoPairs.tsx'),
      'utf8'
    );
    const homeCss = readFileSync(
      path.join(webRoot, 'app/(home)/home.css'),
      'utf8'
    );

    expect(componentSource).toContain('home-bento-pairs-section');
    expect(componentSource).toContain('text-primary-token');
    expect(componentSource).not.toContain('text-black');
    expect(homeCss).toMatch(
      /\.home-bento-pairs-section\s*\{[^}]*background:\s*var\(--system-b-bg-page\);/
    );
  });
});
