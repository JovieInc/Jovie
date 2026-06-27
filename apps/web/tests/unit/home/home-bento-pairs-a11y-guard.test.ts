import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');

describe('HomeBentoPairs light-band a11y guard', () => {
  it('scopes a light surface so black marketing copy passes axe on the dark homepage', () => {
    const componentSource = readFileSync(
      path.join(webRoot, 'components/features/home/HomeBentoPairs.tsx'),
      'utf8'
    );
    const homeCss = readFileSync(
      path.join(webRoot, 'app/(home)/home.css'),
      'utf8'
    );

    expect(componentSource).toContain('home-bento-pairs-section');
    expect(componentSource).not.toMatch(
      /home-bento-pairs-section[^`]*bg-\(--color-bg-base\)/
    );
    expect(homeCss).toMatch(
      /\.home-bento-pairs-section\s*\{[^}]*--color-bg-base:\s*#f5f5f7;/
    );
    expect(componentSource).not.toMatch(/dark:text-white/);
    expect(componentSource).not.toMatch(/dark:bg-surface-1/);
  });
});
