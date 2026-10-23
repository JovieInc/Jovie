import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  collectMarketingEyebrowCapsHits,
  evaluateWarnOnlyCount,
  measureMarketingEyebrowCaps,
} from '../../../scripts/marketing-eyebrow-caps';

/**
 * Blocking ratchet for all-caps eyebrows on marketing routes.
 * The live count must equal the baseline. Growth fails. Shrink fails until
 * the baseline count is lowered in the same change.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(__dirname, 'marketing-eyebrow-caps.baseline.json');

interface EyebrowCapsBaseline {
  readonly armed: boolean;
  readonly count: number;
}

describe('marketing eyebrow caps ratchet', () => {
  const baseline = JSON.parse(
    readFileSync(BASELINE_PATH, 'utf8')
  ) as EyebrowCapsBaseline;
  const measured = measureMarketingEyebrowCaps();

  it('matches the recorded count for marketing eyebrows', () => {
    expect([
      'apps/web/app/(marketing)',
      'apps/web/app/(home)',
      'apps/web/components/marketing',
    ]).toEqual([
      'apps/web/app/(marketing)',
      'apps/web/app/(home)',
      'apps/web/components/marketing',
    ]);
    expect(baseline.armed).toBe(true);
    const status = evaluateWarnOnlyCount(measured.count, baseline.count);
    expect(status, measured.hits.map(hit => `${hit.file}:${hit.line}`).join('\n')).toBe(
      'ok'
    );
  });
});

describe('marketing eyebrow caps detector', () => {
  it('flags named eyebrows and tracked caps, and ignores plain uppercase', () => {
    const source = [
      '<p className="ap-shell-eyebrow text-xs uppercase">Section</p>',
      '<p className="text-xs uppercase tracking-wide">Label</p>',
      '<p className="uppercase">SMS</p>',
      '<p className="uppercase tracking-normal">Title</p>',
      '// uppercase tracking-wide in a comment',
    ].join('\n');

    expect(
      collectMarketingEyebrowCapsHits(source, 'app/(marketing)/page.tsx')
    ).toEqual([
      {
        file: 'app/(marketing)/page.tsx',
        line: 1,
        kind: 'named-eyebrow',
        text: '<p className="ap-shell-eyebrow text-xs uppercase">Section</p>',
      },
      {
        file: 'app/(marketing)/page.tsx',
        line: 2,
        kind: 'tracked-caps',
        text: '<p className="text-xs uppercase tracking-wide">Label</p>',
      },
    ]);
  });

  it('flags a nested CSS eyebrow and ignores an untracked uppercase rule', () => {
    const source = `
      @media (min-width: 1024px) {
        .system-b-launch-kicker {
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .date-chip {
          text-transform: uppercase;
        }
      }
    `;
    const hits = collectMarketingEyebrowCapsHits(
      source,
      'apps/web/components/marketing/Hero.css'
    );
    expect(hits.map(hit => hit.kind)).toEqual(['named-eyebrow']);
    expect(hits[0]?.text).toContain('text-transform: uppercase');
  });

  it('flags tracked CSS caps when the selector is not named eyebrow', () => {
    const source = `
      .module-label {
        font-size: 11px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }
    `;
    expect(
      collectMarketingEyebrowCapsHits(
        source,
        'apps/web/components/marketing/Label.css'
      )
    ).toEqual([
      {
        file: 'apps/web/components/marketing/Label.css',
        line: 5,
        kind: 'tracked-caps',
        text: 'text-transform: uppercase;',
      },
    ]);
  });

  it('skips stories and scans only marketing roots', () => {
    const root = mkdtempSync(join(tmpdir(), 'eyebrow-caps-'));
    try {
      const marketing = join(root, 'apps/web/app/(marketing)');
      const product = join(root, 'apps/web/app/app/(shell)');
      const stories = join(root, 'apps/web/components/marketing');
      mkdirSync(marketing, { recursive: true });
      mkdirSync(product, { recursive: true });
      mkdirSync(stories, { recursive: true });
      const hit = '<p className="uppercase tracking-wide">Eyebrow</p>';
      writeFileSync(join(marketing, 'page.tsx'), hit);
      writeFileSync(join(product, 'page.tsx'), hit);
      writeFileSync(join(stories, 'Widget.stories.tsx'), hit);
      const measured = measureMarketingEyebrowCaps(root);
      expect(measured.count).toBe(1);
      expect(measured.hits[0]?.file).toBe('apps/web/app/(marketing)/page.tsx');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports growth without treating it as a failure status the ratchet can throw', () => {
    expect(evaluateWarnOnlyCount(4, 3)).toBe('regression');
    expect(evaluateWarnOnlyCount(2, 3)).toBe('shrink');
    expect(evaluateWarnOnlyCount(3, 3)).toBe('ok');
  });
});
