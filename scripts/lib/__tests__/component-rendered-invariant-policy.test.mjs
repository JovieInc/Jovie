import { describe, expect, it } from 'vitest';
import {
  evaluateRenderedFamily,
  evaluateRenderedSnapshots,
} from '../../component-rendered-invariant-policy.mjs';

const SHARED_GEOMETRY = Object.freeze({
  paddingTop: 2,
  paddingRight: 6,
  paddingBottom: 2,
  paddingLeft: 6,
  borderRadius: 9999,
  borderTop: 1,
  borderRight: 1,
  borderBottom: 1,
  borderLeft: 1,
  borderTopLeftRadius: 9999,
  borderTopRightRadius: 9999,
  borderBottomRightRadius: 9999,
  borderBottomLeftRadius: 9999,
  minHeight: 20,
  height: 20,
  fontSize: 12,
  lineHeight: 16,
  fontWeight: 510,
});

function variant(key, tone) {
  return {
    key,
    tone,
    expectedTone: tone,
    owner: 'DotBadge',
    anatomy: 'span[span[]]',
    geometry: { ...SHARED_GEOMETRY },
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
    text: key[0].toUpperCase() + key.slice(1),
  };
}

function validFixture() {
  return {
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
  };
}

const rulesFor = fixture =>
  evaluateRenderedFamily(fixture).issues.map(issue => issue.rule);

describe('rendered component invariant policy', () => {
  it('accepts one source-blind semantic family with shared anatomy and geometry', () => {
    expect(evaluateRenderedFamily(validFixture())).toEqual({
      ok: true,
      issues: [],
    });
  });

  it('deliberate red: rejects a light treatment rendered on a dark surface', () => {
    const fixture = validFixture();
    fixture.actualTheme = 'dark';
    expect(rulesFor(fixture)).toContain('theme-surface-mismatch');
  });

  it('deliberate red: rejects split ownership and arbitrary variant anatomy', () => {
    const fixture = validFixture();
    fixture.variants[1].owner = 'MediumBadge';
    fixture.variants[1].anatomy = 'div[span[],span[]]';
    expect(rulesFor(fixture)).toEqual(
      expect.arrayContaining([
        'split-component-owner',
        'arbitrary-variant-anatomy',
      ])
    );
  });

  it('fails closed when theme, surface, owner, variants, or rendered a11y evidence is missing', () => {
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

  it('fails closed when an approved surface token is not declared', () => {
    const fixture = validFixture();
    fixture.surfaceToken = '';
    expect(rulesFor(fixture)).toContain('surface-token-missing');
  });

  it('deliberate red: rejects padding, radius, geometry, and semantic-tone drift', () => {
    const fixture = validFixture();
    fixture.variants[2].geometry.paddingLeft = 12;
    fixture.variants[2].paddingTokenMatched = false;
    fixture.variants[2].radiusTokenMatched = false;
    fixture.variants[2].concentricRadius = false;
    fixture.variants[2].tone = 'warning';
    expect(rulesFor(fixture)).toEqual(
      expect.arrayContaining([
        'arbitrary-variant-geometry',
        'padding-token-mismatch',
        'radius-token-mismatch',
        'nonconcentric-radius',
        'semantic-tone-mismatch',
      ])
    );
  });

  it('fails closed when a rendered variant is omitted from semantic tone mapping', () => {
    const fixture = validFixture();
    fixture.variants[1].expectedTone = null;
    fixture.variants[1].expectedToneMapped = false;
    expect(rulesFor(fixture)).toContain('semantic-tone-missing');
  });

  it('deliberate red: rejects AA, zoom, keyboard, hover, emoji, and decorative caps failures', () => {
    const fixture = validFixture();
    fixture.variants[0] = {
      ...fixture.variants[0],
      text: '\u2705 HIGH',
      textContrast: 3.2,
      zoomOverflow: true,
      interactive: true,
      keyboardReachable: false,
      hoverBoxBefore: { x: 0, y: 0, width: 40, height: 20 },
      hoverBoxAfter: { x: 0, y: -1, width: 40, height: 20 },
    };
    expect(rulesFor(fixture)).toEqual(
      expect.arrayContaining([
        'contrast-below-aa',
        'text-or-zoom-overflow',
        'keyboard-path-missing',
        'hover-layout-shift',
        'emoji-or-checkmark',
        'decorative-caps',
      ])
    );
  });

  it('fails closed when hover geometry is unavailable for an interactive variant', () => {
    const fixture = validFixture();
    fixture.variants[0] = {
      ...fixture.variants[0],
      interactive: true,
      keyboardReachable: true,
      hoverBoxBefore: { x: 0, y: 0, width: 40, height: 20 },
      hoverBoxAfter: null,
    };
    expect(rulesFor(fixture)).toContain('hover-layout-shift');
  });

  it('rejects arbitrary corner radius geometry', () => {
    const fixture = validFixture();
    fixture.variants[1].geometry.borderTopRightRadius = 4;
    fixture.variants[1].radiusTokenMatched = false;
    expect(rulesFor(fixture)).toEqual(
      expect.arrayContaining([
        'arbitrary-variant-geometry',
        'radius-token-mismatch',
      ])
    );
  });

  it('rejects an accidental tab stop on a non-interactive status display', () => {
    const fixture = validFixture();
    fixture.variants[1].tabbableCount = 1;
    expect(rulesFor(fixture)).toContain('noninteractive-tab-stop');
  });

  it('aggregates viewport receipts and fails an empty rendered run', () => {
    expect(evaluateRenderedSnapshots([validFixture()])).toMatchObject({
      ok: true,
      results: [{ family: 'Priority status', ok: true }],
    });
    expect(evaluateRenderedSnapshots([])).toEqual({ ok: false, results: [] });
  });
});
