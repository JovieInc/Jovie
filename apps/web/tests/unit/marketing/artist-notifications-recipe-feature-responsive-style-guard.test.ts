import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const stylesheetPath =
  'components/marketing/artist-profile/ArtistProfileLandingPage.css';
const heroTitleSelector = ':where(.system-b-artist-notifications-hero-title)';
const heroTitleLineSelector =
  ':where(.system-b-artist-notifications-hero-title-line)';

function extractRule(source: string, selector: string, startAt = 0): string {
  const selectorStart = source.indexOf(selector, startAt);
  expect(
    selectorStart,
    `${selector} exists after offset ${startAt}`
  ).toBeGreaterThanOrEqual(0);

  const blockStart = source.indexOf('{', selectorStart);
  const blockEnd = source.indexOf('}', blockStart);
  expect(blockStart, `${selector} has an opening block`).toBeGreaterThan(
    selectorStart
  );
  expect(blockEnd, `${selector} has a closing block`).toBeGreaterThan(
    blockStart
  );

  return source.slice(selectorStart, blockEnd + 1);
}

describe('recipe.feature artist notifications responsive title contract', () => {
  const stylesheet = readFileSync(
    resolve(process.cwd(), stylesheetPath),
    'utf8'
  );

  it('uses a desktop type slope that keeps the explicit hero lines intact at 1024px', () => {
    const compactRule = extractRule(stylesheet, heroTitleSelector);
    const tabletMediaStart = stylesheet.indexOf(
      '@media (min-width: 640px)',
      stylesheet.indexOf(compactRule) + compactRule.length
    );
    const desktopMediaStart = stylesheet.indexOf(
      '@media (min-width: 1024px)',
      tabletMediaStart
    );
    const desktopRule = extractRule(
      stylesheet,
      heroTitleSelector,
      desktopMediaStart
    );

    expect(desktopMediaStart).toBeGreaterThan(tabletMediaStart);
    expect(desktopRule).toContain('font-size: clamp(3.6rem, 6.25vw, 7.2rem);');
  });

  it('preserves the compact 390px wrapping and no-overflow fallback', () => {
    const compactRule = extractRule(stylesheet, heroTitleSelector);
    const titleLineRule = extractRule(stylesheet, heroTitleLineSelector);

    expect(compactRule).toContain('font-size: clamp(3rem, 15vw, 3.6rem);');
    expect(titleLineRule).toContain('max-width: 100%;');
    expect(titleLineRule).toContain('overflow-wrap: break-word;');
    expect(titleLineRule).not.toContain('white-space: nowrap;');
  });
});
