import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  auditMarketingMediaRecipeDecision,
  COMPACT_GLASS_MEDIA_RECIPE,
  DARK_GLASS_MEDIA_RECIPE,
  FLOWING_ACCENT_MEDIA_RECIPE,
  formatMarketingMediaRecipesForPrompt,
  JOVIE_MARKETING_MEDIA_RECIPE_SCHEMA,
  JOVIE_MARKETING_MEDIA_RECIPE_VERSION,
  MARKETING_ASSET_GENERATION_MEDIA_RECIPE_CONTRACT,
  MARKETING_MEDIA_RECIPE_ACCENTS,
  MARKETING_MEDIA_RECIPE_FOUNDER_LOCK,
  MARKETING_MEDIA_RECIPE_IDS,
  MARKETING_MEDIA_RECIPE_MOTION_FALLBACKS,
  MARKETING_MEDIA_RECIPE_OUTPUT_PROFILES,
  MARKETING_MEDIA_RECIPE_SAFE_AREAS,
  MARKETING_MEDIA_RECIPE_SOURCE_MATRIX,
  MARKETING_VISUAL_REVIEW_MEDIA_RECIPE_CONTRACT,
  resolveMarketingMediaRecipeForExport,
  SOFT_EDITORIAL_BACKGROUND_MEDIA_RECIPE,
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
  it('locks the four approved recipes in the golden fixture', () => {
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

    expect({
      css: COMPACT_GLASS_MEDIA_RECIPE.source.css,
      selector: COMPACT_GLASS_MEDIA_RECIPE.source.selector,
      shell: COMPACT_GLASS_MEDIA_RECIPE.material.shell,
      shellToken: COMPACT_GLASS_MEDIA_RECIPE.material.shellToken,
      shellHex: COMPACT_GLASS_MEDIA_RECIPE.material.shellHex,
      blurPx: COMPACT_GLASS_MEDIA_RECIPE.material.blurPx,
      backdropFilter: COMPACT_GLASS_MEDIA_RECIPE.material.backdropFilter,
      minHeightRem: COMPACT_GLASS_MEDIA_RECIPE.geometry.minHeightRem,
      maxWidth: COMPACT_GLASS_MEDIA_RECIPE.geometry.maxWidth,
      radius: COMPACT_GLASS_MEDIA_RECIPE.geometry.radius,
      fontSizePx: COMPACT_GLASS_MEDIA_RECIPE.material.fontSizePx,
    }).toEqual(golden.compactGlass);

    expect({
      css: SOFT_EDITORIAL_BACKGROUND_MEDIA_RECIPE.source.css,
      selector: SOFT_EDITORIAL_BACKGROUND_MEDIA_RECIPE.source.selector,
      component: SOFT_EDITORIAL_BACKGROUND_MEDIA_RECIPE.source.component,
      width: SOFT_EDITORIAL_BACKGROUND_MEDIA_RECIPE.field.width,
      height: SOFT_EDITORIAL_BACKGROUND_MEDIA_RECIPE.field.height,
      radius: SOFT_EDITORIAL_BACKGROUND_MEDIA_RECIPE.field.radius,
      centerPosition:
        SOFT_EDITORIAL_BACKGROUND_MEDIA_RECIPE.field.centerPosition,
      opacity: SOFT_EDITORIAL_BACKGROUND_MEDIA_RECIPE.field.opacity,
      blurToken: SOFT_EDITORIAL_BACKGROUND_MEDIA_RECIPE.field.blurToken,
      blurPx: SOFT_EDITORIAL_BACKGROUND_MEDIA_RECIPE.field.blurPx,
      underlightInset: SOFT_EDITORIAL_BACKGROUND_MEDIA_RECIPE.underlight.inset,
      underlightBlurToken:
        SOFT_EDITORIAL_BACKGROUND_MEDIA_RECIPE.underlight.blurToken,
      underlightBlurPx:
        SOFT_EDITORIAL_BACKGROUND_MEDIA_RECIPE.underlight.blurPx,
    }).toEqual(golden.softEditorialBackground);

    expect(MARKETING_MEDIA_RECIPE_SOURCE_MATRIX).toEqual(golden.sourceMatrix);
    expect(MARKETING_MEDIA_RECIPE_ACCENTS).toEqual(golden.accents);
    expect(MARKETING_MEDIA_RECIPE_SAFE_AREAS).toEqual(golden.safeAreas);
    expect(MARKETING_MEDIA_RECIPE_MOTION_FALLBACKS).toEqual(
      golden.motionFallbacks
    );
    expect(MARKETING_MEDIA_RECIPE_OUTPUT_PROFILES).toEqual(
      golden.outputProfiles
    );
  });

  it('binds dark-glass to the Pen-locked MarketingHeader premium bar', () => {
    const headerCss = readWebSource('components/site/MarketingHeader.css');

    expect(headerCss).toContain('GTcgO');
    expect(headerCss).toContain('eoUUU');
    expect(headerCss).toContain('re-seated as a docked bar');
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

  it('binds compact-glass to the captureShared audience pill material', () => {
    const css = readWebSource(
      'components/marketing/artist-profile/captureShared.css'
    );

    expect(css).toContain('.artist-profile-audience-pill');
    expect(css).toContain(
      'color-mix(in oklab, var(--system-b-cinematic-black) 82%, transparent)'
    );
    expect(css).toContain('backdrop-filter: blur(14px)');
    expect(css).toContain('border-radius: 9999px');
    expect(css).toContain('min-height: 3rem');
    expect(css).toContain('max-width: min(21rem, calc(100vw - 4rem))');
    expect(COMPACT_GLASS_MEDIA_RECIPE.never.join(' ')).toMatch(
      /side panels|unrelated controls/
    );
  });

  it('binds soft-editorial-background to the homepage editorial light well', () => {
    const css = readWebSource('app/(home)/home.css');
    const hero = readWebSource('components/homepage/HomepageEditorialHero.tsx');

    expect(css).toContain('.homepage-editorial-hero__light-well');
    expect(css).toContain('width: min(80rem, 120vw)');
    expect(css).toContain('height: min(42rem, 62vw)');
    expect(css).toContain('border-radius: 50%');
    expect(css).toContain('top: 48%');
    expect(css).toContain('opacity: 0.5');
    expect(css).toContain('filter: blur(var(--space-8))');
    expect(css).toContain('inset: 42% 14% auto');
    expect(css).toContain('filter: blur(var(--space-12))');
    expect(hero).toContain("data-hero-visual='abstract-light-field'");
    expect(SOFT_EDITORIAL_BACKGROUND_MEDIA_RECIPE.never.join(' ')).toMatch(
      /off-center|Crossing/
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
    expect(promptBlock).toContain('ProductScreenshotFrame');
    expect(promptBlock).toContain('one dominant curved sweep');
    expect(promptBlock).toContain('reference-review/2026-09-12');
    expect(promptBlock).toContain('Scene Palette v1');
    expect(promptBlock).not.toContain('homepage-v2-hero__glow-blob');
  });

  it('resolves only the four approved recipes for export', () => {
    expect(
      resolveMarketingMediaRecipeForExport({ recipeId: 'dark-glass' })
    ).toEqual({
      ok: true,
      recipe: DARK_GLASS_MEDIA_RECIPE,
    });
    expect(
      resolveMarketingMediaRecipeForExport({ recipeId: 'compact-glass' })
    ).toEqual({
      ok: true,
      recipe: COMPACT_GLASS_MEDIA_RECIPE,
    });
    expect(
      resolveMarketingMediaRecipeForExport({
        recipeId: 'soft-editorial-background',
      })
    ).toEqual({
      ok: true,
      recipe: SOFT_EDITORIAL_BACKGROUND_MEDIA_RECIPE,
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
      auditMarketingMediaRecipeDecision({
        recipeId: 'compact-glass',
        blurPx: 14,
        shellMixPercent: 82,
      })
    ).toEqual([]);

    expect(
      auditMarketingMediaRecipeDecision({
        recipeId: 'soft-editorial-background',
        bloomBlurPx: 32,
        bloomOpacity: 0.5,
      })
    ).toEqual([]);

    expect(
      codes(
        auditMarketingMediaRecipeDecision({
          recipeId: 'compact-glass',
          blurPx: 30,
          shellMixPercent: 70,
        })
      )
    ).toEqual(['compact-glass-material-drift']);

    expect(
      codes(
        auditMarketingMediaRecipeDecision({
          recipeId: 'soft-editorial-background',
          bloomBlurPx: 90,
          bloomOpacity: 0.9,
        })
      )
    ).toEqual(['editorial-background-drift']);

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
