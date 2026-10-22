import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { HOMEPAGE_IDENTITY_COPY } from '@/data/homepageIdentityCopy';
import {
  type CorrectionHit,
  findBannedNames,
  findBannedPhrases,
  findRawJsxCopy,
  JSX_ROOTS,
  keysFor,
  LOCKED_HOMEPAGE_H1,
  listCorrectionFiles,
  PHRASE_AND_NAME_ROOTS,
  repoRootFromModule,
  scanBannedNames,
  scanBannedPhrases,
  scanRawJsx,
  stripComments,
  tightenBaseline,
  type WarnBaseline,
} from './correction-guards';

const webRoot = path.resolve(__dirname, '../../..');
const repoRoot = path.resolve(webRoot, '../..');
const phraseBaselinePath = path.join(__dirname, 'banned-phrase.baseline.json');
const jsxBaselinePath = path.join(__dirname, 'raw-jsx-copy.baseline.json');

function readBaseline(file: string): WarnBaseline {
  return JSON.parse(readFileSync(file, 'utf8')) as WarnBaseline;
}

function expectWarnRatchet(current: readonly string[], file: string): void {
  const baseline = readBaseline(file);
  expect(baseline.mode).toBe('warn');
  expect(baseline.tighten).toBe('auto');
  expect(baseline.schema).toBe('jovie.correction-guard-baseline/v1');
  expect(baseline.count).toBe(baseline.violations.length);
  const next = tightenBaseline(baseline, current);
  if (next.tightened) {
    writeFileSync(file, `${JSON.stringify(next.baseline, null, 2)}\n`);
  }
  expect(next.added).toEqual([]);
}

describe('correction pyramid guards', () => {
  it('names the marketing roots source-read CI selects', () => {
    expect([...PHRASE_AND_NAME_ROOTS]).toEqual([
      'apps/web/app/(home)',
      'apps/web/app/(marketing)',
      'apps/web/components/homepage',
      'apps/web/components/features/home',
      'apps/web/components/marketing',
      'apps/web/components/site',
      'apps/web/content',
      'apps/web/data/marketing',
      'apps/web/lib/constants/schemas.ts',
    ]);
    expect([...JSX_ROOTS]).toEqual([
      'apps/web/app/(home)',
      'apps/web/components/homepage',
      'apps/web/components/marketing',
      'apps/web/components/site',
    ]);
    expect(repoRootFromModule()).toBe(repoRoot);
    const files = listCorrectionFiles(repoRoot, PHRASE_AND_NAME_ROOTS);
    expect(files).toContain('apps/web/app/(home)/page.tsx');
    expect(files).toContain('apps/web/data/homepageIdentityCopy.ts');
    expect(files).toContain('apps/web/lib/constants/schemas.ts');
    expect(
      files.some(
        file =>
          file.startsWith('apps/web/content/legal/') ||
          file.startsWith('apps/web/content/investors/')
      )
    ).toBe(false);
    expect(files.some(file => file.includes('/profile/scraped-'))).toBe(false);
  });

  it('fails when Daniel Kang or Haruki appear in marketing surfaces', () => {
    const planted = findBannedNames(
      'Notes mention daniel kang.\n// Haruki stays banned in comments too.'
    );
    expect(planted.map(hit => hit.rule)).toEqual(['daniel-kang', 'haruki']);
    expect(planted[0]?.text).toBe('daniel kang');
    expect(planted[1]?.line).toBe(2);

    const hits = scanBannedNames(repoRoot);
    expect(
      hits.map((hit: CorrectionHit) => `${hit.file}:${hit.line} ${hit.text}`)
    ).toEqual([]);
  });

  it('keeps link-in-bio and niche-music phrasing on the warn baseline', () => {
    expect(
      findBannedPhrases('// link in bio in a comment').map(hit => hit.text)
    ).toEqual([]);
    const planted = findBannedPhrases(
      "alternateName: 'Jovie Link in Bio'\nconst niche = 'musician-first for musicians';"
    );
    expect(planted.map(hit => hit.rule)).toEqual([
      'link-in-bio',
      'niche-music',
      'niche-music',
    ]);
    expect(keysFor(planted)[0]).toContain('Jovie Link in Bio');

    const current = scanBannedPhrases(repoRoot);
    expectWarnRatchet(current, phraseBaselinePath);
    const baseline = readBaseline(phraseBaselinePath);
    const liveGrandfather = current.some(key =>
      key.includes('Jovie Link in Bio')
    );
    expect(
      baseline.violations.some(key => key.includes('Jovie Link in Bio'))
    ).toBe(liveGrandfather);
  });

  it('keeps raw marketing JSX copy on the warn baseline', () => {
    const source = [
      '<h1>{copy.headline}</h1>',
      '<p>Be found. Be understood.</p>',
      '<img alt="Tim White profile" />',
      '<button>Go</button>',
    ].join('\n');
    const hits = findRawJsxCopy(source);
    expect(hits.map(hit => hit.text)).toEqual([
      'Be found. Be understood.',
      'Tim White profile',
    ]);
    expectWarnRatchet(scanRawJsx(repoRoot), jsxBaselinePath);
  });

  it('locks the homepage H1 to the identity copy module', () => {
    expect(HOMEPAGE_IDENTITY_COPY.hero.headline).toBe(LOCKED_HOMEPAGE_H1);
    expect(LOCKED_HOMEPAGE_H1).toBe('Start with your name');
    const hero = readFileSync(
      path.join(webRoot, 'components/homepage/HomepageIdentityHero.tsx'),
      'utf8'
    );
    const page = readFileSync(
      path.join(webRoot, 'app/(home)/page.tsx'),
      'utf8'
    );
    expect(hero).toContain('copy.headline');
    expect(hero).toContain('HOMEPAGE_IDENTITY_COPY');
    expect(hero).not.toContain('>Be found. Be understood.<');
    expect(page).toContain('HomepageIdentityHero');
  });

  it('tightens a warn baseline only when every live key is already known', () => {
    const baseline: WarnBaseline = {
      schema: 'jovie.correction-guard-baseline/v1',
      mode: 'warn',
      issue: 'JOV-8606',
      tighten: 'auto',
      count: 2,
      violations: ['a.ts :: link-in-bio :: one', 'b.ts :: niche-music :: two'],
    };
    const shrunk = tightenBaseline(baseline, ['a.ts :: link-in-bio :: one']);
    expect(shrunk.tightened).toBe(true);
    expect(shrunk.baseline.count).toBe(1);
    expect(shrunk.removed).toEqual(['b.ts :: niche-music :: two']);

    const grew = tightenBaseline(baseline, [
      ...baseline.violations,
      'c.ts :: link-in-bio :: Jovie Link in Bio',
    ]);
    expect(grew.tightened).toBe(false);
    expect(grew.added).toEqual(['c.ts :: link-in-bio :: Jovie Link in Bio']);
    expect(grew.baseline.violations).toEqual(baseline.violations);

    const directory = mkdtempSync(path.join(tmpdir(), 'correction-guard-'));
    const file = path.join(directory, 'baseline.json');
    writeFileSync(file, `${JSON.stringify(baseline, null, 2)}\n`);
    expectWarnRatchet(['a.ts :: link-in-bio :: one'], file);
    expect(readBaseline(file).violations).toEqual([
      'a.ts :: link-in-bio :: one',
    ]);
  });

  it('keeps comment text out of phrase and JSX scans', () => {
    const source =
      'const label = "link in bio"; // musician-first\n/* for musicians */';
    expect(stripComments(source)).not.toContain('musician-first');
    expect(stripComments(source)).toContain('link in bio');
    expect(findBannedPhrases(source).map(hit => hit.text)).toEqual([
      'link in bio',
    ]);
  });
});
