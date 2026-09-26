import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  auditMarketingMediaRecipeDecision,
  DARK_GLASS_MEDIA_RECIPE,
  FLOWING_ACCENT_MEDIA_RECIPE,
  formatMarketingMediaRecipesForPrompt,
  JOVIE_MARKETING_MEDIA_RECIPE_SCHEMA,
  JOVIE_MARKETING_MEDIA_RECIPE_VERSION,
  MARKETING_ASSET_GENERATION_MEDIA_RECIPE_CONTRACT,
  MARKETING_MEDIA_RECIPE_FOUNDER_LOCK,
  MARKETING_MEDIA_RECIPE_IDS,
  MARKETING_VISUAL_REVIEW_MEDIA_RECIPE_CONTRACT,
  resolveMarketingMediaRecipeForExport,
} from '@/data/marketing';
import golden from './fixtures/media-recipe-contract.golden.json';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dirname, '..', '..', '..');

function readWebSource(relativePath: string): string {
  return readFileSync(resolve(WEB_ROOT, relativePath), 'utf8');
}

function codes(
  findings: ReturnType<typeof auditMarketingMediaRecipeDecision>
): readonly string[] {
  return findings.map(finding => finding.code);
}

describe('marketing media recipe contract (JOV-6246)', () => {
  it('locks the approved dark-glass and flowing-accent golden fixture', () => {
    expect(JOVIE_MARKETING_MEDIA_RECIPE_SCHEMA).toBe(golden.schema);
    expect(JOVIE_MARKETING_MEDIA_RECIPE_VERSION).toBe(golden.version);
    expect(MARKETING_MEDIA_RECIPE_IDS).toEqual(golden.approvedRecipeIds);
    expect(MARKETING_MEDIA_RECIPE_FOUNDER_LOCK.visualStandard).toBe(
      golden.visualStandard
    );
    expect(MARKETING_MEDIA_RECIPE_FOUNDER_LOCK.bloomDecisionRef).toBe(
      golden.bloomDecisionRef
    );

    expect({
      penContractId: DARK_GLASS_MEDIA_RECIPE.source.penContractId,
      masterId: DARK_GLASS_MEDIA_RECIPE.source.masterId,
      presentation: DARK_GLASS_MEDIA_RECIPE.source.presentation,
      opticalGridPx: DARK_GLASS_MEDIA_RECIPE.opticalGridPx,
      heightRem: DARK_GLASS_MEDIA_RECIPE.geometry.heightRem,
      heightPx: DARK_GLASS_MEDIA_RECIPE.geometry.heightPx,
      shellMixPercent: DARK_GLASS_MEDIA_RECIPE.material.shellMixPercent,
      scrolledShellMixPercent:
        DARK_GLASS_MEDIA_RECIPE.material.scrolledShellMixPercent,
      blurPx: DARK_GLASS_MEDIA_RECIPE.material.blurPx,
      saturatePercent: DARK_GLASS_MEDIA_RECIPE.material.saturatePercent,
      backdropFilter: DARK_GLASS_MEDIA_RECIPE.material.backdropFilter,
      darkShellHex: DARK_GLASS_MEDIA_RECIPE.material.darkShellHex,
      darkCanvasHex: DARK_GLASS_MEDIA_RECIPE.material.darkCanvasHex,
    }).toEqual(golden.darkGlass);

    expect({
      viewBox: FLOWING_ACCENT_MEDIA_RECIPE.seam.viewBox,
      path: FLOWING_ACCENT_MEDIA_RECIPE.seam.path,
      accentToken: FLOWING_ACCENT_MEDIA_RECIPE.seam.accentToken,
      accentHex: FLOWING_ACCENT_MEDIA_RECIPE.seam.accentHex,
      bloomTreatment: FLOWING_ACCENT_MEDIA_RECIPE.bloom.treatment,
      bloomBlurPx: FLOWING_ACCENT_MEDIA_RECIPE.bloom.blurPx,
      bloomOpacity: FLOWING_ACCENT_MEDIA_RECIPE.bloom.opacity,
      bloomBackgroundToken: FLOWING_ACCENT_MEDIA_RECIPE.bloom.backgroundToken,
      bloomBackgroundRgba: FLOWING_ACCENT_MEDIA_RECIPE.bloom.backgroundRgba,
      reducedMotion: FLOWING_ACCENT_MEDIA_RECIPE.seam.reducedMotion,
    }).toEqual(golden.flowingAccent);
  });

  it('binds dark-glass to the Pen-locked MarketingHeader premium bar', () => {
    const headerCss = readWebSource('components/site/MarketingHeader.css');

    expect(headerCss).toContain('GTcgO');
    expect(headerCss).toContain('eoUUU');
    expect(headerCss).toContain('Floating Bar capsule');
    expect(headerCss).toContain('--marketing-glass-height: 2.75rem');
    expect(headerCss).toContain('var(--noir-ion-shell) 82%');
    expect(headerCss).toContain('var(--noir-ion-shell) 90%');
    expect(headerCss).toContain('blur(20px) saturate(165%)');
    expect(headerCss).toContain('data-presentation="marketing-glass"');
    expect(DARK_GLASS_MEDIA_RECIPE.never.join(' ')).toMatch(/HeaderNav\.css/);
  });

  it('binds flowing-accent to the electric seam and newer-hero bloom B', () => {
    const seam = readWebSource(
      'components/marketing/MarketingElectricSeam.tsx'
    );
    const homeCss = readWebSource('app/(home)/home.css');
    const tokens = readWebSource('styles/design-system.css');

    expect(seam).toContain(FLOWING_ACCENT_MEDIA_RECIPE.seam.viewBox);
    expect(seam).toContain(FLOWING_ACCENT_MEDIA_RECIPE.seam.path);
    expect(seam).toContain("stdDeviation='3.2'");
    expect(seam).toContain("stdDeviation='1.8'");
    expect(homeCss).toContain('.homepage-poster-hero__media::before');
    expect(homeCss).toContain('inset: -18% 8% auto');
    expect(homeCss).toContain('filter: blur(80px)');
    expect(homeCss).toContain('opacity: 0.42');
    expect(homeCss).toContain('var(--color-accent-blue-subtle)');
    expect(tokens).toMatch(/--geist-cyan-solid:\s*#22c1fc/i);
    expect(tokens).toMatch(/--noir-ion-shell:\s*#07080a/i);
    expect(tokens).toMatch(
      /--color-accent-blue-subtle:\s*rgba\(17,\s*175,\s*255,\s*0\.12\)/
    );
  });

  it('embeds the same recipe prompt in asset generation and visual review', () => {
    const promptBlock = formatMarketingMediaRecipesForPrompt();

    expect(MARKETING_ASSET_GENERATION_MEDIA_RECIPE_CONTRACT.policySchema).toBe(
      JOVIE_MARKETING_MEDIA_RECIPE_SCHEMA
    );
    expect(MARKETING_VISUAL_REVIEW_MEDIA_RECIPE_CONTRACT.policyVersion).toBe(
      JOVIE_MARKETING_MEDIA_RECIPE_VERSION
    );
    expect(
      MARKETING_ASSET_GENERATION_MEDIA_RECIPE_CONTRACT.approvedRecipeIds
    ).toEqual(MARKETING_MEDIA_RECIPE_IDS);
    expect(MARKETING_ASSET_GENERATION_MEDIA_RECIPE_CONTRACT.promptBlock).toBe(
      promptBlock
    );
    expect(MARKETING_VISUAL_REVIEW_MEDIA_RECIPE_CONTRACT.promptBlock).toBe(
      promptBlock
    );
    expect(promptBlock).toContain('dark-glass');
    expect(promptBlock).toContain('flowing-accent');
    expect(promptBlock).toContain('GTcgO');
    expect(promptBlock).toContain('soft optical bloom B');
    expect(promptBlock).toContain('#22C1FC');
    expect(promptBlock).toContain('blur(20px) saturate(165%)');
    expect(promptBlock).not.toContain('homepage-v2-hero__glow-blob');
  });

  it('resolves only the two approved recipes for export', () => {
    expect(
      resolveMarketingMediaRecipeForExport({ recipeId: 'dark-glass' })
    ).toEqual({
      ok: true,
      recipe: DARK_GLASS_MEDIA_RECIPE,
    });
    expect(
      resolveMarketingMediaRecipeForExport({ recipeId: 'flowing-accent' })
    ).toEqual({
      ok: true,
      recipe: FLOWING_ACCENT_MEDIA_RECIPE,
    });
    const rejected = resolveMarketingMediaRecipeForExport({
      recipeId: 'neon-prism',
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(codes(rejected.findings)).toEqual(['unapproved-export-recipe']);
    }
  });

  it('rejects invented taste and drifted locked values', () => {
    expect(
      auditMarketingMediaRecipeDecision({
        recipeId: 'dark-glass',
        pillHeightPx: 44,
        ctaHeightPx: 28,
        chromeMarkPx: 20,
        blurPx: 20,
        saturatePercent: 165,
        shellMixPercent: 82,
        scrolledShellMixPercent: 90,
      })
    ).toEqual([]);

    expect(
      auditMarketingMediaRecipeDecision({
        recipeId: 'flowing-accent',
        seamPath: FLOWING_ACCENT_MEDIA_RECIPE.seam.path,
        seamViewBox: FLOWING_ACCENT_MEDIA_RECIPE.seam.viewBox,
        bloomBlurPx: 80,
        bloomOpacity: 0.42,
        bloomBackgroundToken: '--color-accent-blue-subtle',
      })
    ).toEqual([]);

    expect(
      codes(
        auditMarketingMediaRecipeDecision({
          recipeId: 'crystal-ribbon',
        })
      )
    ).toEqual(['unknown-media-recipe']);

    expect(
      codes(
        auditMarketingMediaRecipeDecision({
          recipeId: 'dark-glass',
          inventedTaste: true,
          pillHeightPx: 52,
          blurPx: 12,
        })
      )
    ).toEqual(
      expect.arrayContaining([
        'invented-media-taste',
        'dark-glass-geometry-drift',
        'dark-glass-material-drift',
      ])
    );

    expect(
      codes(
        auditMarketingMediaRecipeDecision({
          recipeId: 'flowing-accent',
          seamPath: 'M0 12 L1200 12',
          bloomBlurPx: 120,
          bloomOpacity: 0.7,
        })
      )
    ).toEqual(
      expect.arrayContaining([
        'flowing-accent-seam-drift',
        'flowing-accent-bloom-drift',
      ])
    );
  });
});
