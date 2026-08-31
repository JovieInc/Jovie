import { describe, expect, it } from 'vitest';
import {
  evaluateRenderedFamily,
  evaluateRenderedSnapshots,
} from '../../component-rendered-invariant-policy.mjs';

const GEOMETRY = Object.freeze(
  Object.fromEntries(
    'paddingTop=2,paddingRight=6,paddingBottom=2,paddingLeft=6,borderRadius=9999,borderTop=1,borderRight=1,borderBottom=1,borderLeft=1,borderTopLeftRadius=9999,borderTopRightRadius=9999,borderBottomRightRadius=9999,borderBottomLeftRadius=9999,minHeight=20,height=20,fontSize=12,lineHeight=16,fontWeight=510'
      .split(',')
      .map(pair => {
        const [key, value] = pair.split('=');
        return [key, Number(value)];
      })
  )
);
const BOX = Object.freeze({ x: 0, y: 0, width: 40, height: 20 });
function variant(key, tone) {
  return {
    key,
    tone,
    expectedTone: tone,
    owner: 'DotBadge',
    anatomy: 'span[span[]]',
    geometry: { ...GEOMETRY },
    paddingTokenMatched: true,
    radiusTokenMatched: true,
    concentricRadius: true,
    textContrast: 7.2,
    requiredContrast: 4.5,
    expectedToneMapped: true,
    overflowX: false,
    overflowY: false,
    zoomOverflow: false,
    interactive: false,
    tabbableCount: 0,
    text: key,
  };
}
const validFixture = () => ({
  family: 'Priority status',
  declaredTheme: 'light',
  actualTheme: 'light',
  surfaceToken: '--color-bg-surface-0',
  surfaceMatchesToken: true,
  canonicalOwner: 'DotBadge',
  variants: [
    variant('high', 'positive'),
    variant('medium', 'warning'),
    variant('low', 'danger'),
  ],
});
const rulesFor = fixture =>
  evaluateRenderedFamily(fixture).issues.map(issue => issue.rule);
function expectRules(mutator, expectedRules) {
  const fixture = validFixture();
  mutator(fixture);
  expect(rulesFor(fixture)).toEqual(expect.arrayContaining(expectedRules));
}

describe('rendered component invariant policy', () => {
  it('accepts valid rendered evidence and non-text contrast evidence', () => {
    expect(evaluateRenderedFamily(validFixture())).toEqual({
      ok: true,
      issues: [],
    });
    const nonText = validFixture();
    Object.assign(nonText.variants[0], {
      text: '',
      textContrast: 3.2,
      requiredContrast: 3,
    });
    Object.assign(nonText.variants[1], {
      text: '',
      textContrast: null,
      requiredContrast: null,
    });
    expect(evaluateRenderedFamily(nonText)).toEqual({ ok: true, issues: [] });
  });
  it('fails closed when family-level rendered evidence is missing', () => {
    const result = evaluateRenderedFamily({
      family: 'Broken family',
      declaredTheme: '',
      actualTheme: '',
      surfaceToken: '--color-bg-surface-0',
      surfaceMatchesToken: false,
      canonicalOwner: '',
      axeViolations: ['color-contrast'],
      variants: [],
    });
    expect(result.ok).toBe(false);
    expect(result.issues.map(issue => issue.rule)).toEqual(
      expect.arrayContaining([
        'theme-contract-missing',
        'surface-token-mismatch',
        'canonical-owner-missing',
        'axe-violation',
        'rendered-variants-missing',
      ])
    );
  });
  it.each([
    [f => (f.actualTheme = 'dark'), ['theme-surface-mismatch']],
    [f => (f.surfaceToken = ''), ['surface-token-missing']],
    [
      f =>
        Object.assign(f.variants[1], {
          owner: 'MediumBadge',
          anatomy: 'div[span[],span[]]',
        }),
      ['split-component-owner', 'arbitrary-variant-anatomy'],
    ],
    [
      f => {
        Object.assign(f.variants[2], {
          paddingTokenMatched: false,
          radiusTokenMatched: false,
          concentricRadius: false,
          tone: 'warning',
        });
        f.variants[2].geometry.paddingLeft = 12;
      },
      [
        'arbitrary-variant-geometry',
        'padding-token-mismatch',
        'radius-token-mismatch',
        'nonconcentric-radius',
        'semantic-tone-mismatch',
      ],
    ],
    [
      f =>
        Object.assign(f.variants[1], {
          expectedTone: null,
          expectedToneMapped: false,
        }),
      ['semantic-tone-missing'],
    ],
    [
      f =>
        Object.assign(f.variants[0], {
          text: '\u2705 HIGH',
          textContrast: 3.2,
          zoomOverflow: true,
          interactive: true,
          keyboardReachable: false,
          keyboardActivatable: false,
          hoverBoxBefore: BOX,
          hoverBoxAfter: { ...BOX, y: -1 },
        }),
      [
        'contrast-below-aa',
        'text-or-zoom-overflow',
        'keyboard-path-missing',
        'keyboard-activation-missing',
        'hover-layout-shift',
        'emoji-or-checkmark',
        'decorative-caps',
      ],
    ],
    [
      f =>
        Object.assign(f.variants[0], {
          interactive: true,
          keyboardReachable: true,
          keyboardActivatable: true,
          hoverBoxBefore: BOX,
          hoverBoxAfter: null,
        }),
      ['hover-layout-shift'],
    ],
    [
      f => {
        f.variants[1].geometry.borderTopRightRadius = 4;
        f.variants[1].radiusTokenMatched = false;
      },
      ['arbitrary-variant-geometry', 'radius-token-mismatch'],
    ],
    [f => (f.variants[1].tabbableCount = 1), ['noninteractive-tab-stop']],
  ])('rejects invalid rendered evidence %#', (mutate, expected) => {
    expectRules(mutate, expected);
  });
  it('aggregates viewport receipts and fails an empty rendered run', () => {
    expect(evaluateRenderedSnapshots([validFixture()])).toMatchObject({
      ok: true,
      results: [{ family: 'Priority status', ok: true }],
    });
    expect(evaluateRenderedSnapshots([])).toEqual({ ok: false, results: [] });
  });
});
