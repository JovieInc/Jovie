import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  auditMarketingEditorialBackgroundDecision,
  EDITORIAL_BACKGROUND_FLOW,
  EDITORIAL_BACKGROUND_SOFT,
  getMarketingEditorialBackground,
  isMarketingEditorialBackgroundVariantId,
  JOVIE_EDITORIAL_BACKGROUND_SCHEMA,
  JOVIE_EDITORIAL_BACKGROUND_VERSION,
  JOVIE_IMAGE_COLOR_POLICY,
  MARKETING_EDITORIAL_BACKGROUND_VARIANT_IDS,
  MARKETING_EDITORIAL_BACKGROUNDS,
  type MarketingEditorialBackgroundVariant,
} from '@/data/marketing';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dirname, '..', '..', '..');

function readWebSource(relativePath: string): string {
  return readFileSync(resolve(WEB_ROOT, relativePath), 'utf8');
}

function sceneEntry(role: string) {
  return JOVIE_IMAGE_COLOR_POLICY.scenePalette.find(
    entry => entry.role === role
  );
}

/** Extract the numeric y of the first M and last coordinate pair of a path. */
function pathRises(path: string): boolean {
  const nums = path.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const startY = nums[1];
  const endY = nums[nums.length - 1];
  return startY !== undefined && endY !== undefined && endY < startY;
}

const VARIANTS: readonly MarketingEditorialBackgroundVariant[] = [
  EDITORIAL_BACKGROUND_SOFT,
  EDITORIAL_BACKGROUND_FLOW,
];

describe('marketing editorial backgrounds (JOV-6249)', () => {
  it('registers exactly the two approved variants of one system', () => {
    expect(JOVIE_EDITORIAL_BACKGROUND_SCHEMA).toBe(
      'jovie-editorial-background/v1'
    );
    expect(JOVIE_EDITORIAL_BACKGROUND_VERSION).toBe('editorial-masters-v1');
    expect(MARKETING_EDITORIAL_BACKGROUND_VARIANT_IDS).toEqual([
      'soft',
      'flow',
    ]);
    expect(Object.keys(MARKETING_EDITORIAL_BACKGROUNDS).sort()).toEqual([
      'flow',
      'soft',
    ]);
    for (const id of MARKETING_EDITORIAL_BACKGROUND_VARIANT_IDS) {
      expect(isMarketingEditorialBackgroundVariantId(id)).toBe(true);
      expect(getMarketingEditorialBackground(id).id).toBe(id);
      expect(getMarketingEditorialBackground(id).source.specIssueId).toBe(
        'JOV-6246'
      );
    }
    expect(isMarketingEditorialBackgroundVariantId('neon-chaos')).toBe(false);
  });

  it('anchors each dominant chromatic core to the JOV-5265 scene palette', () => {
    for (const variant of VARIANTS) {
      const entry = sceneEntry(variant.accent.role);
      expect(entry).toBeDefined();
      expect(variant.accent.uiHex).toBe(entry?.uiAnchor.hex);
      expect(variant.accent.sceneHex).toBe(entry?.sceneReference.hex);
    }
    // soft → ultra (subdued violet haze), flow → ion (production cyan family)
    expect(EDITORIAL_BACKGROUND_SOFT.accent.role).toBe('ultra');
    expect(EDITORIAL_BACKGROUND_FLOW.accent.role).toBe('ion');
    expect(EDITORIAL_BACKGROUND_FLOW.accent.uiToken).toBe(
      '--system-b-accent-cyan'
    );
  });

  it('declares off-center focal points and content-safe dark regions', () => {
    for (const variant of VARIANTS) {
      const { focal, contentSafe } = variant.composition;
      for (const point of [focal.desktop, focal.mobile]) {
        expect(point.x === 50 && point.y === 50).toBe(false);
      }
      for (const rect of [contentSafe.desktop, contentSafe.mobile]) {
        expect(rect.width).toBeGreaterThanOrEqual(40);
        expect(rect.height).toBeGreaterThanOrEqual(50);
      }
      expect(variant.composition.flowDirection.desktop.length).toBeGreaterThan(
        0
      );
      expect(variant.composition.flowDirection.mobile.length).toBeGreaterThan(
        0
      );
    }
  });

  it('keeps the flow field coherent: one dominant sweep, no crossing curves', () => {
    const curves = EDITORIAL_BACKGROUND_FLOW.curves.list;
    expect(curves.filter(c => c.weight === 'dominant')).toHaveLength(1);
    expect(curves.filter(c => c.weight === 'subordinate').length).toBe(2);
    // Every curve rises left→right with the same direction — no contradiction.
    for (const curve of curves) {
      expect(pathRises(curve.path)).toBe(true);
      expect(curve.path.startsWith('M-60 ')).toBe(true);
      expect(curve.path).toMatch(/ 1500 \d+$/);
    }
    // Subordinate echoes sit vertically offset from the dominant path.
    const dominantStartY = Number(curves[0]?.path.split(' ')[1]);
    for (const curve of curves.slice(1)) {
      expect(Number(curve.path.split(' ')[1])).not.toBe(dominantStartY);
    }
    // Soft has no curves at all — atmosphere only.
    expect(EDITORIAL_BACKGROUND_SOFT.curves.list).toHaveLength(0);
  });

  it('requires layered washes and static masters with bounded-motion policy', () => {
    for (const variant of VARIANTS) {
      expect(variant.washes.count).toBeGreaterThanOrEqual(2);
      expect(variant.washes.maxPeakOpacity).toBeLessThanOrEqual(0.16);
      expect(variant.motion.master).toBe('static');
      expect(variant.motion.reducedMotion).toBe('static-master');
    }
  });

  it('binds the component and CSS to the registered contract', () => {
    const component = readWebSource(
      'components/marketing/MarketingEditorialBackground.tsx'
    );
    const css = readWebSource(
      'components/marketing/MarketingEditorialBackground.css'
    );

    const contract = readWebSource('data/marketing/editorialBackgrounds.ts');

    expect(component).toContain('data-variant={variant}');
    expect(component).toContain("aria-hidden='true'");
    expect(component).toContain('spec.curves.viewBox');
    for (const curve of EDITORIAL_BACKGROUND_FLOW.curves.list) {
      expect(contract).toContain(curve.path);
    }

    for (const variant of VARIANTS) {
      expect(css).toContain(`data-variant="${variant.id}"`);
      expect(css).toContain(variant.accent.washToken);
    }

    // Wash-layer counts in CSS match the contract (per-variant blocks).
    const softBlock = css.split('data-variant="soft"')[1] ?? '';
    const flowBlock = css.split('data-variant="flow"')[1] ?? '';
    expect(
      softBlock.split('radial-gradient').length - 1
    ).toBeGreaterThanOrEqual(EDITORIAL_BACKGROUND_SOFT.washes.count);
    expect(
      flowBlock.split('radial-gradient').length - 1
    ).toBeGreaterThanOrEqual(EDITORIAL_BACKGROUND_FLOW.washes.count);

    // Desktop focal positions are emitted literally.
    expect(css).toContain('at 72% 28%');
    expect(css).toContain('at 78% 30%');
    // High-contrast / forced-colors degrade to the plain canvas.
    expect(css).toContain('forced-colors: active');
  });

  it('passes clean decisions and flags every defect class', () => {
    for (const variant of VARIANTS) {
      expect(
        auditMarketingEditorialBackgroundDecision({
          variantId: variant.id,
          accentRole: variant.accent.role,
          accentHex: variant.accent.uiHex,
          focal: variant.composition.focal.desktop,
        })
      ).toEqual([]);
    }

    const cases: readonly [string, Record<string, unknown>, string][] = [
      [
        'unknown variant',
        { variantId: 'neon-chaos' },
        'unknown-editorial-variant',
      ],
      [
        'off-canon accent role',
        { variantId: 'flow', accentRole: 'pulse' },
        'editorial-accent-off-canon',
      ],
      [
        'off-canon accent hex',
        { variantId: 'soft', accentHex: '#00FF00' },
        'editorial-accent-off-canon',
      ],
      [
        'centered-only hotspot',
        { variantId: 'soft', focal: { x: 50, y: 50 } },
        'editorial-centered-hotspot',
      ],
      [
        'flat uniform glow',
        { variantId: 'soft', singleUniformLayer: true },
        'editorial-uniform-glow',
      ],
      [
        'crossing curves',
        { variantId: 'flow', curvesCross: true },
        'editorial-crossing-curves',
      ],
      [
        'competing bright center',
        { variantId: 'flow', competingBrightCenter: true },
        'editorial-competing-bright-center',
      ],
      [
        'clipped foreground',
        { variantId: 'soft', clipsForeground: true },
        'editorial-clipped-foreground',
      ],
      [
        'unbounded motion',
        { variantId: 'flow', unboundedMotion: true },
        'editorial-unbounded-motion',
      ],
    ];

    for (const [label, decision, code] of cases) {
      const findings = auditMarketingEditorialBackgroundDecision(
        decision as never
      );
      expect(
        findings.map(f => f.code),
        label
      ).toContain(code);
    }
  });
});
