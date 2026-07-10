import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '@/lib/utils/color';

const webRoot = path.resolve(__dirname, '../../..');

/** Light-band surface + primary copy from home.css token scope (JOV-3567). */
const LIGHT_BAND_BG = '#f5f5f7';
const LIGHT_BAND_FG = '#000000';

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
    // Component uses scoped semantic tokens — not a second bg override that
    // would fight the light-band section rule.
    expect(componentSource).not.toMatch(
      /home-bento-pairs-section[^`]*bg-\(--color-bg-base\)/
    );
    expect(componentSource).not.toContain('dark:bg-surface-1');
    expect(componentSource).toMatch(/bg-white[^`]*dark:bg-white/);
    expect(componentSource).toContain('text-(--color-text-primary-token)');
    expect(componentSource).toContain('text-(--color-text-secondary-token)');
    expect(homeCss).toMatch(
      /\.home-bento-pairs-section\s*\{[^}]*--color-bg-base:\s*#f5f5f7;/
    );
    expect(homeCss).toMatch(
      /\.home-bento-pairs-section\s*\{[^}]*--color-text-secondary-token:/
    );
  });

  it('light-band primary copy meets WCAG AA contrast (>= 4.5:1)', () => {
    expect(contrastRatio(LIGHT_BAND_FG, LIGHT_BAND_BG)).toBeGreaterThanOrEqual(
      4.5
    );
  });
});