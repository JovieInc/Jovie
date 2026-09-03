import { describe, expect, it } from 'vitest';
import {
  evaluateRenderedFamily,
  evaluateRenderedSnapshots,
} from '../../component-rendered-invariant-policy.mjs';

// biome-ignore format: compact fixture keeps this source-PR under the hard size cap
const GEOMETRY = Object.fromEntries('paddingTop=2,paddingRight=6,paddingBottom=2,paddingLeft=6,borderRadius=9999,borderTop=1,borderRight=1,borderBottom=1,borderLeft=1,borderTopLeftRadius=9999,borderTopRightRadius=9999,borderBottomRightRadius=9999,borderBottomLeftRadius=9999,minHeight=20,height=20,fontSize=12,lineHeight=16,fontWeight=510'.split(',').map(pair => { const [key, value] = pair.split('='); return [key, Number(value)]; }));
const BOX = { x: 0, y: 0, width: 40, height: 20 };
const rulesFor = sample =>
  evaluateRenderedFamily(sample).issues.map(issue => issue.rule);

// biome-ignore format: compact fixture keeps this source-PR under the hard size cap
function variant(key, tone, extra = {}) { return { key, tone, expectedTone: tone, expectedToneMapped: true, owner: 'DotBadge', anatomy: 'span[span[]]', geometry: { ...GEOMETRY }, paddingTokenMatched: true, radiusTokenMatched: true, concentricRadius: true, textContrast: 7.2, requiredContrast: 4.5, targetVisible: true, variantKeyDuplicate: false, variantKeyMissing: false, overflowX: false, overflowY: false, zoomOverflow: false, interactive: false, tabbableCount: 0, text: key, ...extra }; }

// biome-ignore format: compact fixture keeps this source-PR under the hard size cap
function fixture() { return { family: 'Priority status', declaredTheme: 'light', actualTheme: 'light', surfaceToken: '--color-bg-surface-0', surfaceMatchesToken: true, canonicalOwner: 'DotBadge', variants: [variant('high', 'positive'), variant('medium', 'warning'), variant('low', 'danger')] }; }

describe('rendered component invariant policy', () => {
  it('accepts valid rendered evidence and non-text contrast evidence', () => {
    expect(evaluateRenderedFamily(fixture())).toEqual({ ok: true, issues: [] });
    const nonText = fixture();
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

  // biome-ignore format: compact matrix keeps this source-PR under the hard size cap
  it.each([
    ['theme', f => (f.actualTheme = 'dark'), ['theme-surface-mismatch']],
    ['surface token', f => (f.surfaceToken = ''), ['surface-token-missing']],
    ['owner/anatomy', f => Object.assign(f.variants[1], { owner: 'MediumBadge', anatomy: 'div[span[],span[]]' }), ['split-component-owner', 'arbitrary-variant-anatomy']],
    ['geometry/tokens/tone', f => { Object.assign(f.variants[2], { paddingTokenMatched: false, radiusTokenMatched: false, concentricRadius: false, tone: 'warning' }); f.variants[2].geometry.paddingLeft = 12; }, ['arbitrary-variant-geometry', 'padding-token-mismatch', 'radius-token-mismatch', 'nonconcentric-radius', 'semantic-tone-mismatch']],
    ['missing tone', f => Object.assign(f.variants[1], { expectedTone: null, expectedToneMapped: false }), ['semantic-tone-missing']],
    ['interaction and copy', f => Object.assign(f.variants[0], { text: '\u2705 HIGH', textContrast: 3.2, zoomOverflow: true, interactive: true, keyboardReachable: false, keyboardActivatable: false, hoverBoxBefore: BOX, hoverBoxAfter: { ...BOX, y: -1 } }), ['contrast-below-aa', 'text-or-zoom-overflow', 'keyboard-path-missing', 'keyboard-activation-missing', 'hover-layout-shift', 'emoji-or-checkmark', 'decorative-caps']],
    ['disappearing hover target', f => Object.assign(f.variants[0], { interactive: true, keyboardReachable: true, keyboardActivatable: true, hoverBoxBefore: BOX, hoverBoxAfter: null }), ['hover-layout-shift']],
    ['corner drift', f => { f.variants[1].geometry.borderTopRightRadius = 4; f.variants[1].radiusTokenMatched = false; }, ['arbitrary-variant-geometry', 'radius-token-mismatch']],
    ['tab stop', f => (f.variants[1].tabbableCount = 1), ['noninteractive-tab-stop']],
    ['hidden duplicate key', f => Object.assign(f.variants[1], { key: '', targetVisible: false, variantKeyDuplicate: true, variantKeyMissing: true }), ['variant-key-missing', 'variant-key-duplicate', 'variant-target-hidden']],
  ])('rejects invalid rendered evidence: %s', (_name, mutate, expected) => {
    const sample = fixture();
    mutate(sample);
    expect(rulesFor(sample)).toEqual(expect.arrayContaining(expected));
  });

  it('aggregates viewport receipts and fails an empty rendered run', () => {
    expect(evaluateRenderedSnapshots([fixture()])).toMatchObject({
      ok: true,
      results: [{ family: 'Priority status', ok: true }],
    });
    expect(evaluateRenderedSnapshots([])).toEqual({ ok: false, results: [] });
  });
});
