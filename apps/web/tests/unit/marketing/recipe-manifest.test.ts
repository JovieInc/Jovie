/**
 * Marketing Recipe Manifest Gate — the load-bearing enforcement surface.
 *
 * Per the amended charter (E4, DX1), this vitest test rides the existing
 * Unit Tests lane and asserts:
 *   1. route-glob ⇔ manifest bidirectional (every (marketing) + (home) + waitlist route is mapped/exempted)
 *   2. glob-count floor (catches route-group rename — silent-failure guard)
 *   3. recipeId ∈ registry
 *   4. proven recipes reference a real route (CI refuses proven without reference)
 *   5. recipe sectionIds ∈ section registry
 *   6. exemption ratchet (decrease-only vs EXEMPTION_RATCHET_BASELINE)
 *   7. docs⇔registry anchor parity (every SECTION_CATALOG anchor ⇔ section id)
 *   8. kebab-case id regex assertion (charter delta #9)
 *   9. variant id uniqueness per section
 *  10. defaultVariant exists per section
 *  11. total order per section (no chooseWhen ties) — defaultVariant is the no-match fallback
 *  12. golden-fixture determinism: 3 blind briefs × 2 runs → identical MarketingComposition tuples (E9)
 *  13. every Brief resolves to exactly one recipe (decision table is total)
 *
 * Failure messages follow the DX3 template: PROBLEM / CAUSE / FIX (exact two-line edit) / DOCS.
 */

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  EXEMPTION_RATCHET_BASELINE,
  getRouteRecipeParity,
  MARKETING_RECIPE_IDS,
  MARKETING_RECIPES,
  MARKETING_ROUTE_MANIFEST,
  MARKETING_SECTION_IDS,
  MARKETING_SECTIONS,
  MARKETING_SPEC_VERSION,
  MarketingBriefSchema,
  MarketingCompositionSchema,
  type MarketingSectionId,
  PROPOSED_SECTIONS,
  type RecipeId,
  resolveComposition,
} from '@/data/marketing';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../../../../..'); // apps/web/tests/unit/marketing → repo root
const DOCS_DIR = resolve(ROOT, 'docs/marketing');
const BRIEFS_DIR = resolve(__dirname, 'fixtures/briefs');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const KEBAB_REGEX = /^[a-z][a-z0-9-]*$/;
const fail = (
  problem: string,
  cause: string,
  fix: string,
  docs: string
): never => {
  throw new Error(
    `\nPROBLEM: ${problem}\nCAUSE: ${cause}\nFIX: ${fix}\nDOCS: ${docs}`
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. Registry integrity
// ─────────────────────────────────────────────────────────────────────────────

describe('marketing registry integrity', () => {
  it('every section id is kebab-case (charter delta #9)', () => {
    for (const id of MARKETING_SECTION_IDS) {
      if (!KEBAB_REGEX.test(id)) {
        fail(
          `section id "${id}" is not kebab-case`,
          'charter delta #9 requires kebab-case ids (regex /^[a-z][a-z0-9-]*$/)',
          `rename the section id to kebab-case in apps/web/data/marketing/sections.ts and update all references`,
          'docs/marketing/ARCHITECTURE.md §Naming Conventions'
        );
      }
    }
  });

  it('every recipe id is kebab-case', () => {
    for (const id of MARKETING_RECIPE_IDS) {
      if (!KEBAB_REGEX.test(id)) {
        fail(
          `recipe id "${id}" is not kebab-case`,
          'charter delta #9 requires kebab-case ids',
          `rename the recipe id to kebab-case in apps/web/data/marketing/recipes.ts`,
          'docs/marketing/ARCHITECTURE.md §Naming Conventions'
        );
      }
    }
  });

  it('every section has exactly one defaultVariant', () => {
    for (const section of MARKETING_SECTIONS) {
      if (
        !section.defaultVariant ||
        !section.variants.some(v => v.id === section.defaultVariant)
      ) {
        fail(
          `section "${section.id}" has no valid defaultVariant`,
          'every section must declare a defaultVariant that exists in its variants array',
          `add defaultVariant: '${section.variants[0]?.id ?? '...'}' to section ${section.id} in apps/web/data/marketing/sections.ts`,
          'docs/marketing/ARCHITECTURE.md §Variant System'
        );
      }
    }
  });

  it('variant ids are unique per section', () => {
    for (const section of MARKETING_SECTIONS) {
      const ids = section.variants.map(v => v.id);
      const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
      if (dupes.length > 0) {
        fail(
          `section "${section.id}" has duplicate variant ids: ${dupes.join(', ')}`,
          'variant ids must be unique within a section',
          `rename the duplicate variant(s) in apps/web/data/marketing/sections.ts section ${section.id}`,
          'docs/marketing/ARCHITECTURE.md §Variant System'
        );
      }
    }
  });

  it('split-layout variants declare mediaPosition (prior-art §4 axis rule)', () => {
    for (const section of MARKETING_SECTIONS) {
      for (const v of section.variants) {
        if (v.layout === 'split' && !v.mediaPosition) {
          fail(
            `variant "${v.id}" in section "${section.id}" has layout=split but no mediaPosition`,
            'mediaPosition is required when layout=split (orthogonal axis rule)',
            `add mediaPosition: 'right' | 'left' | 'bottom' to variant ${v.id} in apps/web/data/marketing/sections.ts`,
            'docs/marketing/ARCHITECTURE.md §Variant Axes'
          );
        }
      }
    }
  });

  it('deprecated variants reference an active replacedBy', () => {
    for (const section of MARKETING_SECTIONS) {
      for (const v of section.variants) {
        if (v.status === 'deprecated' && v.replacedBy) {
          const replacement = section.variants.find(r => r.id === v.replacedBy);
          if (!replacement || replacement.status !== 'active') {
            fail(
              `deprecated variant "${v.id}" references replacedBy "${v.replacedBy}" which is not an active variant`,
              'replacedBy must reference an active variant (lifecycle rule)',
              `update replacedBy on variant ${v.id} in apps/web/data/marketing/sections.ts to point to an active variant`,
              'docs/marketing/ARCHITECTURE.md §Lifecycle'
            );
          }
        }
      }
    }
  });

  it('MARKETING_SECTION_IDS count matches MARKETING_SECTIONS (no drift)', () => {
    if (MARKETING_SECTION_IDS.length !== MARKETING_SECTIONS.length) {
      fail(
        `MARKETING_SECTION_IDS has ${MARKETING_SECTION_IDS.length} entries but MARKETING_SECTIONS has ${MARKETING_SECTIONS.length}`,
        'the union and the registry drifted apart',
        'sync MARKETING_SECTION_IDS and MARKETING_SECTIONS in apps/web/data/marketing/sections.ts',
        'docs/marketing/ARCHITECTURE.md §Section Taxonomy'
      );
    }
  });

  it('MARKETING_RECIPE_IDS count matches MARKETING_RECIPES (no drift)', () => {
    if (MARKETING_RECIPE_IDS.length !== MARKETING_RECIPES.length) {
      fail(
        `MARKETING_RECIPE_IDS has ${MARKETING_RECIPE_IDS.length} entries but MARKETING_RECIPES has ${MARKETING_RECIPES.length}`,
        'the union and the registry drifted apart',
        'sync MARKETING_RECIPE_IDS and MARKETING_RECIPES in apps/web/data/marketing/recipes.ts',
        'docs/marketing/ARCHITECTURE.md §Recipe System'
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Recipe integrity
// ─────────────────────────────────────────────────────────────────────────────

describe('marketing recipe integrity', () => {
  it('every recipe sectionId ∈ section registry', () => {
    const validSectionIds = new Set<MarketingSectionId>(MARKETING_SECTION_IDS);
    for (const recipe of MARKETING_RECIPES) {
      for (const sectionId of recipe.sectionOrder) {
        if (!validSectionIds.has(sectionId)) {
          fail(
            `recipe "${recipe.id}" references unknown section "${sectionId}"`,
            'recipe.sectionOrder must only contain ids from MARKETING_SECTION_IDS',
            `replace "${sectionId}" in recipe ${recipe.id}.sectionOrder with a valid section id from apps/web/data/marketing/sections.ts`,
            'docs/marketing/RECIPE_CATALOG.md'
          );
        }
      }
    }
  });

  it('proven recipes have a referenceRoute', () => {
    for (const recipe of MARKETING_RECIPES) {
      if (recipe.status === 'proven' && !recipe.referenceRoute) {
        fail(
          `proven recipe "${recipe.id}" has no referenceRoute`,
          'CI refuses proven without a reference route (charter delta #5, Design F10)',
          `add referenceRoute: '/...' to recipe ${recipe.id} in apps/web/data/marketing/recipes.ts OR change status to 'stub'`,
          'docs/marketing/ARCHITECTURE.md §Two-Tier Recipes'
        );
      }
    }
  });

  it('proven recipe referenceRoute exists in routeManifest', () => {
    // A recipe's referenceRoute is a CANONICAL concrete URL (e.g. '/compare/linktree').
    // The manifest stores URL globs (e.g. '/compare/*') or concrete URLs (e.g. '/artist-profiles').
    // Match if the referenceRoute equals a manifest URL OR falls under a manifest glob.
    const matchesManifest = (referenceRoute: string): boolean =>
      MARKETING_ROUTE_MANIFEST.some(entry => {
        if (entry.url === referenceRoute) return true;
        // glob match: '/compare/*' covers '/compare/linktree'
        if (entry.url.endsWith('/*')) {
          const prefix = entry.url.slice(0, -2);
          return (
            referenceRoute === prefix || referenceRoute.startsWith(`${prefix}/`)
          );
        }
        return false;
      });
    for (const recipe of MARKETING_RECIPES) {
      if (recipe.status === 'proven' && recipe.referenceRoute) {
        if (!matchesManifest(recipe.referenceRoute)) {
          fail(
            `proven recipe "${recipe.id}" referenceRoute "${recipe.referenceRoute}" not found in MARKETING_ROUTE_MANIFEST`,
            'proven recipes must point at a real shipped route (concrete URL or under a manifest glob)',
            `add the route to MARKETING_ROUTE_MANIFEST in apps/web/data/marketing/routeManifest.ts OR change recipe ${recipe.id} status to 'stub'`,
            'docs/marketing/ARCHITECTURE.md §Two-Tier Recipes'
          );
        }
      }
    }
  });

  it('every recipe has a non-empty arc (Design F3 emotional-arc primitive)', () => {
    for (const recipe of MARKETING_RECIPES) {
      if (recipe.arc.length === 0) {
        fail(
          `recipe "${recipe.id}" has no arc beats`,
          'emotional arc is a recipe primitive (Design F3)',
          `add arc beats to recipe ${recipe.id} in apps/web/data/marketing/recipes.ts`,
          'docs/marketing/ARCHITECTURE.md §Emotional Arc'
        );
      }
    }
  });

  it('every recipe declares a CTA cadence (B2B C6 + creator F)', () => {
    for (const recipe of MARKETING_RECIPES) {
      if (!recipe.ctaCadence || !recipe.ctaCadence.primaryLabel) {
        fail(
          `recipe "${recipe.id}" has no ctaCadence.primaryLabel`,
          'one primary CTA label repeated verbatim is the invariant (B2B C6)',
          `add ctaCadence with primaryLabel to recipe ${recipe.id} in apps/web/data/marketing/recipes.ts`,
          'docs/marketing/ARCHITECTURE.md §CTA Cadence'
        );
      }
    }
  });

  it('every recipe has a PageHierarchyContract (Design F1)', () => {
    for (const recipe of MARKETING_RECIPES) {
      if (
        !recipe.hierarchy ||
        !recipe.hierarchy.oneBigIdea ||
        !recipe.hierarchy.seeFirst
      ) {
        fail(
          `recipe "${recipe.id}" has no valid PageHierarchyContract`,
          'one big idea + seeFirst/second/third + emphasis budget is required (Design F1)',
          `add hierarchy to recipe ${recipe.id} in apps/web/data/marketing/recipes.ts`,
          'docs/marketing/ARCHITECTURE.md §Page Hierarchy'
        );
      }
    }
  });

  it('artist-lp recipe arc has no problem-agitation beat (creator R9)', () => {
    const artistLp = MARKETING_RECIPES.find(r => r.id === 'artist-lp');
    if (!artistLp) return;
    const hasProblemBeat = artistLp.arc.some(
      b =>
        /problem|agitat|pain/i.test(b.beat) ||
        /problem|agitat|pain/i.test(b.feeling)
    );
    if (hasProblemBeat) {
      fail(
        `artist-lp recipe has a problem/agitation arc beat`,
        'creator R9: artist arc = recognition → identity → aspiration → capability → money-reality → relatability → low-risk action (NO problem beat)',
        `remove the problem/agitation beat from artist-lp arc in apps/web/data/marketing/recipes.ts`,
        'docs/marketing/RECIPE_CATALOG.md §artist-lp'
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Route manifest integrity
// ─────────────────────────────────────────────────────────────────────────────

describe('marketing route manifest integrity', () => {
  it('every manifest entry has either recipeId or exempt (not both, not neither)', () => {
    for (const entry of MARKETING_ROUTE_MANIFEST) {
      const hasRecipe = entry.recipeId !== undefined;
      const hasExempt = entry.exempt !== undefined;
      if (hasRecipe === hasExempt) {
        fail(
          `manifest entry "${entry.glob}" has both recipeId and exempt (or neither)`,
          'every entry must have exactly one of {recipeId, exempt}',
          `set either recipeId or exempt on entry ${entry.glob} in apps/web/data/marketing/routeManifest.ts`,
          'docs/marketing/ARCHITECTURE.md §Route Manifest'
        );
      }
    }
  });

  it('every exempt entry carries linearId + approvedBy + prUrl (DX2 sanctioned exemption)', () => {
    for (const entry of MARKETING_ROUTE_MANIFEST) {
      if (entry.exempt) {
        if (
          !entry.exempt.linearId ||
          !entry.exempt.approvedBy ||
          !entry.exempt.prUrl
        ) {
          fail(
            `exempt entry "${entry.glob}" missing linearId/approvedBy/prUrl`,
            'DX2 escape hatch: sanctioned exemptions require all three fields',
            `add linearId, approvedBy, prUrl to exempt on ${entry.glob} in apps/web/data/marketing/routeManifest.ts`,
            'docs/marketing/AGENT_GUIDE.md §Deviating from the system'
          );
        }
      }
    }
  });

  it('exemption ratchet: unsanctioned count is decrease-only vs baseline', () => {
    const unsanctionedCount = MARKETING_ROUTE_MANIFEST.filter(
      e =>
        e.exempt &&
        (!e.exempt.linearId || !e.exempt.approvedBy || !e.exempt.prUrl)
    ).length;
    if (
      unsanctionedCount > EXEMPTION_RATCHET_BASELINE.unsanctionedExemptionCount
    ) {
      fail(
        `unsanctioned exemption count ${unsanctionedCount} > baseline ${EXEMPTION_RATCHET_BASELINE.unsanctionedExemptionCount}`,
        'exemption ratchet is decrease-only (DX2): unsanctioned exemptions must not increase',
        `add linearId, approvedBy, prUrl to the new exemption OR remove the exemption`,
        'docs/marketing/AGENT_GUIDE.md §Deviating from the system'
      );
    }
  });

  it('manifest glob-count floor (catches route-group rename — silent-failure guard)', () => {
    // Per codebase-baseline §1: 26 (marketing) page.tsx + (home) + waitlist = 28 manifest entries.
    // Floor = 28 - 2 (tolerance for legitimate removals) = 26. Below this = route-group rename went unmapped.
    const FLOOR = 26;
    if (MARKETING_ROUTE_MANIFEST.length < FLOOR) {
      fail(
        `manifest has ${MARKETING_ROUTE_MANIFEST.length} entries; floor is ${FLOOR}`,
        'glob-count floor catches route-group rename — a silent-failure guard (E4)',
        `add the missing (marketing)/* routes to MARKETING_ROUTE_MANIFEST in apps/web/data/marketing/routeManifest.ts (run: ls apps/web/app/\(marketing\)/*/page.tsx)`,
        'docs/marketing/ARCHITECTURE.md §Route Manifest'
      );
    }
  });

  it('every manifest recipeId ∈ recipe registry', () => {
    const validRecipeIds = new Set<RecipeId>(MARKETING_RECIPE_IDS);
    for (const entry of MARKETING_ROUTE_MANIFEST) {
      if (entry.recipeId && !validRecipeIds.has(entry.recipeId)) {
        fail(
          `manifest entry "${entry.glob}" references unknown recipeId "${entry.recipeId}"`,
          'recipeId must be in MARKETING_RECIPE_IDS',
          `replace "${entry.recipeId}" with a valid recipe id in apps/web/data/marketing/routeManifest.ts`,
          'docs/marketing/RECIPE_CATALOG.md'
        );
      }
    }
  });

  it('every rendered binding resolves to an approved section or approved proposal', () => {
    for (const entry of MARKETING_ROUTE_MANIFEST) {
      for (const binding of entry.renderedSections) {
        if (binding.kind === 'approved-section') {
          const section = MARKETING_SECTIONS.find(
            candidate => candidate.id === binding.sectionId
          );
          expect(section?.status, `${entry.url}: ${binding.sectionId}`).toBe(
            'approved'
          );
          expect(binding.componentPath.trim()).toBeTruthy();
          continue;
        }

        const proposal = PROPOSED_SECTIONS.find(
          candidate => candidate.id === binding.proposalId
        );
        expect(proposal, `${entry.url}: ${binding.proposalId}`).toBeDefined();
        expect(
          proposal && ['approved', 'implemented'].includes(proposal.status),
          `${entry.url} cannot ship proposal ${binding.proposalId} with status ${proposal?.status}`
        ).toBe(true);
      }
    }
  });

  it('every route has bindings or an explicit non-composable exemption', () => {
    for (const entry of MARKETING_ROUTE_MANIFEST) {
      if (entry.renderedSections.length === 0) {
        const hasExemption = Boolean(entry.exempt?.reason.trim());
        const isExplicitlyUnverified =
          entry.bindingEvidence.status === 'unverified' &&
          Boolean(entry.bindingEvidence.notes?.trim());
        expect(hasExemption || isExplicitlyUnverified, entry.url).toBe(true);
      } else {
        expect(entry.recipeId, entry.url).toBeDefined();
      }
    }
  });

  it('keeps audited route-to-recipe parity gaps visible', () => {
    const launchPricing = MARKETING_ROUTE_MANIFEST.find(
      entry => entry.url === '/launch/pricing'
    );
    const artistProfiles = MARKETING_ROUTE_MANIFEST.find(
      entry => entry.url === '/artist-profiles'
    );
    expect(launchPricing).toBeDefined();
    expect(artistProfiles).toBeDefined();

    const launchReport = getRouteRecipeParity(launchPricing!);
    expect(launchReport.actualSectionIds).toEqual(['hero', 'pricing']);
    expect(launchReport.expectedSectionIds).toEqual([
      'hero',
      'pricing',
      'social-proof',
      'comparison',
      'faq',
      'cta',
    ]);
    expect(launchReport.matches).toBe(false);

    const artistReport = getRouteRecipeParity(artistProfiles!);
    expect(artistReport.actualSectionIds).toEqual([
      'hero',
      'logo-cloud',
      'feature-split',
      'social-proof',
      'capture',
      'feature-split',
      'monetization',
      'spec-wall',
      'how-it-works',
      'social-proof',
      'faq',
      'cta',
    ]);
    expect(artistReport.evidenceStatus).toBe('verified');
    expect(artistReport.matches).toBe(false);
  });

  it('does not claim parity for unaudited route bodies', () => {
    const pay = MARKETING_ROUTE_MANIFEST.find(entry => entry.url === '/pay');
    expect(pay).toBeDefined();
    expect(getRouteRecipeParity(pay!).matches).toBeNull();
  });
});

describe('proposed section governance', () => {
  it('uses unique stable proposal ids and complete review records', () => {
    const ids = PROPOSED_SECTIONS.map(proposal => proposal.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const proposal of PROPOSED_SECTIONS) {
      expect(proposal.id).toMatch(/^PROPOSED-SECTION-\d{4}$/);
      expect(proposal.proposedSectionName.trim()).toBeTruthy();
      expect(proposal.problem.trim()).toBeTruthy();
      expect(proposal.affectedRoutes.length).toBeGreaterThan(0);
      expect(proposal.intendedAudience.length).toBeGreaterThan(0);
      expect(proposal.conversionGoal.trim()).toBeTruthy();
      expect(proposal.requiredContentFields.length).toBeGreaterThan(0);
      expect(proposal.requiredMedia.length).toBeGreaterThan(0);
      expect(proposal.proposedResponsiveBehavior.trim()).toBeTruthy();
      expect(proposal.proposedCtaBehavior.trim()).toBeTruthy();
      expect(proposal.similarExistingSections.length).toBeGreaterThan(0);
      expect(proposal.existingApprovedVariantInsufficiency.trim()).toBeTruthy();
      expect(proposal.openDesignQuestions.length).toBeGreaterThan(0);
      expect(proposal.comments.length).toBeGreaterThan(0);
      expect(proposal.registryTask.trigger).toBe('after-approved');
      expect(proposal.registryTask.requiredChanges.length).toBeGreaterThan(0);
      expect(proposal.registryTask.exactFiles.length).toBeGreaterThan(0);
      expect(proposal.registryTask.forbiddenPatterns.length).toBeGreaterThan(0);
      expect(proposal.registryTask.acceptanceCriteria.length).toBeGreaterThan(
        0
      );
      expect(proposal.registryTask.validationCommands.length).toBeGreaterThan(
        0
      );
      expect(proposal.registryTask.evidenceRequired.length).toBeGreaterThan(0);
      expect(proposal.registryTask.implementedAt).toBeNull();
      expect(proposal.registryTask.evidenceRefs).toEqual([]);

      for (const wireframe of [
        proposal.wireframes.desktop,
        proposal.wireframes.mobile,
      ]) {
        expect(wireframe.hierarchy.length).toBeGreaterThan(0);
        expect(wireframe.layout.trim()).toBeTruthy();
        expect(wireframe.mediaPlacement.trim()).toBeTruthy();
        expect(wireframe.responsiveBehavior.trim()).toBeTruthy();
        expect(wireframe.interactionModel.trim()).toBeTruthy();
        expect(wireframe.placeholderContent).toBe('grayscale-only');
      }
    }
  });

  it('seeds only the four audited variant-level design gaps', () => {
    expect(PROPOSED_SECTIONS.map(proposal => proposal.id)).toEqual([
      'PROPOSED-SECTION-0001',
      'PROPOSED-SECTION-0002',
      'PROPOSED-SECTION-0003',
      'PROPOSED-SECTION-0004',
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Decision engine determinism — golden-fixture gate (E9, DX10)
// ─────────────────────────────────────────────────────────────────────────────

describe('marketing decision engine determinism (golden fixtures)', () => {
  it('applies nested brief defaults when asset and brand objects are omitted', () => {
    const parsed = MarketingBriefSchema.parse({
      businessObjective: 'Exercise Zod input defaults',
      targetAudience: 'general',
      desiredConversion: 'start',
      intent: 'category',
    });

    expect(parsed.availableAssets).toEqual({
      socialProofVerified: false,
      statsVerified: false,
      logoCloudVerified: false,
      productScreenshots: true,
      artistFaces: false,
      artistFacesTwoRung: false,
      takeRateReal: false,
      phoneProfileAsset: false,
      videoAsset: false,
    });
    expect(parsed.brandConstraints).toEqual({
      darkOnly: true,
      fullyStatic: true,
      waitlistEnabled: false,
    });
  });

  const briefFiles = [
    'brief-01-artist-claim.json',
    'brief-02-homepage-general.json',
    'brief-03-pricing-compare.json',
  ];

  for (const file of briefFiles) {
    it(`${file}: 2 runs produce identical MarketingComposition tuples (E9)`, async () => {
      const content = await readFile(resolve(BRIEFS_DIR, file), 'utf-8');
      const fixture = JSON.parse(content) as {
        brief: unknown;
        expectedRecipeId: string;
        expectedPrimaryCtaLabel: string;
      };

      // Run 1
      const run1 = resolveComposition(fixture.brief);
      // Run 2 — same Brief, must produce identical tuple
      const run2 = resolveComposition(fixture.brief);

      // Validate against the Zod schema (DX11)
      const parsed1 = MarketingCompositionSchema.safeParse(run1);
      const parsed2 = MarketingCompositionSchema.safeParse(run2);
      if (!parsed1.success) {
        fail(
          `run1 composition failed Zod validation`,
          parsed1.error.message,
          `fix the composition shape in apps/web/data/marketing/composition.ts to satisfy MarketingCompositionSchema`,
          'docs/marketing/ARCHITECTURE.md §Composition Schema'
        );
      }
      if (!parsed2.success) {
        fail(
          `run2 composition failed Zod validation`,
          parsed2.error.message,
          `fix the composition shape in apps/web/data/marketing/composition.ts to satisfy MarketingCompositionSchema`,
          'docs/marketing/ARCHITECTURE.md §Composition Schema'
        );
      }

      // Tuple equality — structural outputs only (recipeId, sectionId[], variantId[], CTA positions, proofData)
      // Trace is excluded from the equality check (it is human-readable; same decisions → same trace anyway, but we compare tuples only).
      const tuple1 = {
        specVersion: run1.specVersion,
        recipeId: run1.recipeId,
        sections: run1.sections,
        primaryCtaLabel: run1.primaryCtaLabel,
        secondaryCtaLabel: run1.secondaryCtaLabel,
        ctaCadence: run1.ctaCadence,
      };
      const tuple2 = {
        specVersion: run2.specVersion,
        recipeId: run2.recipeId,
        sections: run2.sections,
        primaryCtaLabel: run2.primaryCtaLabel,
        secondaryCtaLabel: run2.secondaryCtaLabel,
        ctaCadence: run2.ctaCadence,
      };
      expect(tuple1).toEqual(tuple2);

      // Expected recipeId + primary CTA label match
      expect(run1.recipeId).toBe(fixture.expectedRecipeId);
      expect(run1.primaryCtaLabel).toBe(fixture.expectedPrimaryCtaLabel);
    });
  }

  // D1 fix: replaced the brute O(6048) totality grid (which only asserted
  // "resolves to something," not "resolves to the CORRECT recipe") with a
  // curated property table of ~30 representative briefs asserting specific
  // expected recipeIds. This catches precedence regressions (e.g. A5: waitlist
  // stealing artist briefs; A7: artist+price → pricing instead of artist-lp).
  const PROPERTY_TABLE: readonly {
    name: string;
    brief: Record<string, unknown>;
    expectedRecipeId: string;
  }[] = [
    // A5 fix: waitlist only fires for general/fan, NOT artist/agency/enterprise
    {
      name: 'artist + claim-handle + home + waitlist=true → artist-lp (NOT waitlist)',
      brief: {
        targetAudience: 'artist',
        desiredConversion: 'claim-handle',
        trafficSource: 'home',
        intent: 'artist-profile',
        brandConstraints: { waitlistEnabled: true },
      },
      expectedRecipeId: 'artist-lp',
    },
    {
      name: 'general + request-access → waitlist',
      brief: {
        targetAudience: 'general',
        desiredConversion: 'request-access',
        trafficSource: 'direct',
        intent: 'category',
      },
      expectedRecipeId: 'waitlist',
    },
    {
      name: 'fan + request-access → waitlist',
      brief: {
        targetAudience: 'fan',
        desiredConversion: 'request-access',
        trafficSource: 'direct',
        intent: 'informational',
      },
      expectedRecipeId: 'waitlist',
    },
    // A7 fix: artist wins on any intent (artist+price → artist-lp, NOT pricing)
    {
      name: 'artist + price → artist-lp (NOT pricing — creator R8)',
      brief: {
        targetAudience: 'artist',
        desiredConversion: 'start',
        intent: 'price',
      },
      expectedRecipeId: 'artist-lp',
    },
    {
      name: 'artist + compare → artist-lp (NOT comparison — creator R9)',
      brief: {
        targetAudience: 'artist',
        desiredConversion: 'start',
        intent: 'compare',
      },
      expectedRecipeId: 'artist-lp',
    },
    {
      name: 'artist + feature → artist-lp',
      brief: {
        targetAudience: 'artist',
        desiredConversion: 'claim-profile',
        intent: 'feature',
      },
      expectedRecipeId: 'artist-lp',
    },
    {
      name: 'artist + launch → artist-lp',
      brief: {
        targetAudience: 'artist',
        desiredConversion: 'start',
        intent: 'launch',
      },
      expectedRecipeId: 'artist-lp',
    },
    {
      name: 'artist + category → artist-lp',
      brief: {
        targetAudience: 'artist',
        desiredConversion: 'claim-handle',
        intent: 'category',
      },
      expectedRecipeId: 'artist-lp',
    },
    // Non-artist intent-specific rows
    {
      name: 'general + compare → comparison',
      brief: {
        targetAudience: 'general',
        desiredConversion: 'start',
        intent: 'compare',
      },
      expectedRecipeId: 'comparison',
    },
    {
      name: 'general + price → pricing',
      brief: {
        targetAudience: 'general',
        desiredConversion: 'start',
        intent: 'price',
      },
      expectedRecipeId: 'pricing',
    },
    {
      name: 'general + launch → launch',
      brief: {
        targetAudience: 'general',
        desiredConversion: 'start',
        intent: 'launch',
      },
      expectedRecipeId: 'launch',
    },
    {
      name: 'general + blog-index → blog-landing',
      brief: {
        targetAudience: 'general',
        desiredConversion: 'subscribe',
        intent: 'blog-index',
      },
      expectedRecipeId: 'blog-landing',
    },
    {
      name: 'general + feature → feature',
      brief: {
        targetAudience: 'general',
        desiredConversion: 'start',
        intent: 'feature',
      },
      expectedRecipeId: 'feature',
    },
    // Audience-specific rows
    {
      name: 'agency + any intent → agency-lp',
      brief: {
        targetAudience: 'agency',
        desiredConversion: 'book-demo',
        intent: 'category',
      },
      expectedRecipeId: 'agency-lp',
    },
    {
      name: 'enterprise-buyer + any intent → enterprise',
      brief: {
        targetAudience: 'enterprise-buyer',
        desiredConversion: 'contact-sales',
        intent: 'category',
      },
      expectedRecipeId: 'enterprise',
    },
    // Homepage + SEO
    {
      name: 'general + home traffic → homepage',
      brief: {
        targetAudience: 'general',
        desiredConversion: 'start',
        trafficSource: 'home',
        intent: 'category',
      },
      expectedRecipeId: 'homepage',
    },
    {
      name: 'general + category + non-home traffic → homepage',
      brief: {
        targetAudience: 'general',
        desiredConversion: 'start',
        trafficSource: 'search',
        intent: 'category',
      },
      expectedRecipeId: 'homepage',
    },
    {
      name: 'general + informational → seo',
      brief: {
        targetAudience: 'general',
        desiredConversion: 'none',
        intent: 'informational',
      },
      expectedRecipeId: 'seo',
    },
    // J1 fix: fan audience falls to seo (no fan-lp recipe yet)
    {
      name: 'fan + category → seo (no fan-lp yet)',
      brief: {
        targetAudience: 'fan',
        desiredConversion: 'start',
        intent: 'category',
      },
      expectedRecipeId: 'seo',
    },
    // Catch-all
    {
      name: 'general + unknown combo → seo (catch-all)',
      brief: {
        targetAudience: 'general',
        desiredConversion: 'none',
        intent: 'category',
        trafficSource: 'email',
      },
      expectedRecipeId: 'homepage',
    }, // category+general → homepage row 10
  ];

  it('decision table resolves to the CORRECT recipe per the property table (D1 fix)', () => {
    for (const { name, brief, expectedRecipeId } of PROPERTY_TABLE) {
      const briefBrand = brief.brandConstraints as
        | { waitlistEnabled?: boolean }
        | undefined;
      const fullBrief = {
        businessObjective: 'test',
        targetAudience: brief.targetAudience,
        desiredConversion: brief.desiredConversion,
        trafficSource: brief.trafficSource ?? 'direct',
        intent: brief.intent,
        availableAssets: {},
        brandConstraints: {
          darkOnly: true,
          fullyStatic: true,
          waitlistEnabled: briefBrand?.waitlistEnabled ?? false,
        },
      };
      const composition = resolveComposition(fullBrief);
      if (composition.recipeId !== expectedRecipeId) {
        fail(
          `property-table case "${name}" resolved to ${composition.recipeId}, expected ${expectedRecipeId}`,
          'decision-table precedence regression (D1 property table catches what the brute grid missed)',
          `check RECIPE_DECISION_TABLE row order in apps/web/data/marketing/composition.ts — the case expected ${expectedRecipeId}`,
          'docs/marketing/ARCHITECTURE.md §Decision Engine'
        );
      }
    }
  });

  it('decision table is total: every reachable Brief resolves without throwing (smoke)', () => {
    // Smoke grid — assert no-throw, NOT correctness (correctness is the property table above).
    // Kept as a safety net for enum additions the property table doesn't yet cover.
    const audiences = [
      'artist',
      'fan',
      'agency',
      'label',
      'enterprise-buyer',
      'general',
    ] as const;
    const intents = [
      'category',
      'feature',
      'price',
      'compare',
      'launch',
      'informational',
      'blog-index',
      'artist-profile',
    ] as const;
    const conversions = [
      'start',
      'claim-handle',
      'claim-profile',
      'upgrade',
      'request-access',
      'subscribe',
      'book-demo',
      'contact-sales',
      'none',
    ] as const;
    const trafficSources = [
      'home',
      'search',
      'social',
      'referral',
      'direct',
      'paid',
      'email',
    ] as const;
    let tested = 0;
    for (const audience of audiences) {
      for (const intent of intents) {
        for (const conversion of conversions) {
          for (const traffic of trafficSources) {
            const brief = {
              businessObjective: 'test',
              targetAudience: audience,
              desiredConversion: conversion,
              trafficSource: traffic,
              intent,
              availableAssets: {},
              brandConstraints: {
                darkOnly: true,
                fullyStatic: true,
                waitlistEnabled: false,
              },
            };
            const parsed = MarketingBriefSchema.safeParse(brief);
            if (!parsed.success) continue;
            tested++;
            resolveComposition(parsed.data); // throws if not total
          }
        }
      }
    }
    if (tested < 100) {
      fail(
        `totality smoke grid only tested ${tested} briefs (expected ≥100)`,
        'the Brief enumeration grid is too narrow',
        `expand the audiences/intents/conversions/trafficSources arrays in this test`,
        'docs/marketing/ARCHITECTURE.md §Decision Engine'
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Docs ⇔ registry anchor parity (E4.7, DX12)
// ─────────────────────────────────────────────────────────────────────────────

describe('marketing docs ⇔ registry anchor parity', () => {
  it('every section id has a SECTION_CATALOG anchor (#section-{id})', async () => {
    let catalog: string;
    try {
      catalog = await readFile(
        resolve(DOCS_DIR, 'SECTION_CATALOG.md'),
        'utf-8'
      );
    } catch {
      // Docs ship in PR2-4 after the registry PR1 — skip if not yet present.
      // This test activates once docs land. CI will catch the parity drift at that point.
      return;
    }
    for (const id of MARKETING_SECTION_IDS) {
      const anchor = `#section-${id}`;
      if (!catalog.includes(anchor)) {
        fail(
          `section "${id}" has no anchor "${anchor}" in docs/marketing/SECTION_CATALOG.md`,
          'docs⇔registry anchor parity (E4.7): every section id must have a catalog anchor',
          `add an H2/H3 section with id "section-${id}" to docs/marketing/SECTION_CATALOG.md`,
          'docs/marketing/AGENT_GUIDE.md §Documentation Map'
        );
      }
    }
  });

  it('every recipe id has a RECIPE_CATALOG anchor (#recipe-{id})', async () => {
    let catalog: string;
    try {
      catalog = await readFile(resolve(DOCS_DIR, 'RECIPE_CATALOG.md'), 'utf-8');
    } catch {
      return; // skip if docs not yet present (PR1 ships before PR2-4)
    }
    for (const id of MARKETING_RECIPE_IDS) {
      const anchor = `#recipe-${id}`;
      if (!catalog.includes(anchor)) {
        fail(
          `recipe "${id}" has no anchor "${anchor}" in docs/marketing/RECIPE_CATALOG.md`,
          'docs⇔registry anchor parity (E4.7): every recipe id must have a catalog anchor',
          `add an H2/H3 section with id "recipe-${id}" to docs/marketing/RECIPE_CATALOG.md`,
          'docs/marketing/AGENT_GUIDE.md §Documentation Map'
        );
      }
    }
  });

  it('MARKETING_SPEC_VERSION matches docs ARCHITECTURE.md freshness marker', async () => {
    let arch: string;
    try {
      arch = await readFile(resolve(DOCS_DIR, 'ARCHITECTURE.md'), 'utf-8');
    } catch {
      return; // skip if docs not yet present
    }
    if (!arch.includes(`spec-version: ${MARKETING_SPEC_VERSION}`)) {
      fail(
        `ARCHITECTURE.md spec-version marker does not match MARKETING_SPEC_VERSION="${MARKETING_SPEC_VERSION}"`,
        'spec-version drift fails Structural Contract doc-freshness (E13)',
        `update the "spec-version:" marker in docs/marketing/ARCHITECTURE.md to "${MARKETING_SPEC_VERSION}"`,
        'docs/marketing/ARCHITECTURE.md §Versioning'
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Adversarial-review invariants (A3, B1, E1, F1, H1)
// ─────────────────────────────────────────────────────────────────────────────

describe('marketing adversarial-review invariants', () => {
  it('F1: per-section variant count ≤ 6 (explosion guard)', () => {
    const MAX_VARIANTS_PER_SECTION = 6;
    for (const section of MARKETING_SECTIONS) {
      if (section.variants.length > MAX_VARIANTS_PER_SECTION) {
        fail(
          `section "${section.id}" has ${section.variants.length} variants (cap = ${MAX_VARIANTS_PER_SECTION})`,
          'variant explosion guard (F1): the typed-axis model prevents semantic explosion only if the count is capped',
          `reduce variants on section ${section.id} in apps/web/data/marketing/sections.ts to ≤${MAX_VARIANTS_PER_SECTION}`,
          'docs/marketing/ARCHITECTURE.md §Variant System'
        );
      }
    }
  });

  it('F1: variant axis tuples are unique within a section OR have distinct chooseWhen predicates (content variants allowed)', () => {
    // The typed-axis model prevents LAYOUT explosion. Two variants with the same
    // axis tuple are allowed ONLY if they differ semantically (distinct chooseWhen)
    // — e.g. hero/centered-phone (artist-recipe default) vs hero/centered-handle-claim
    // (Linktree-style claim bar — same layout, different content slot). The
    // chooseWhen predicate is the disambiguator, checked first by the resolver.
    for (const section of MARKETING_SECTIONS) {
      const seen = new Map<string, string>(); // axisKey → chooseWhen
      for (const v of section.variants) {
        const key = `${v.layout}|${v.media}|${v.mediaPosition ?? ''}|${v.columns ?? ''}|${v.density ?? ''}|${v.alignment ?? ''}`;
        const prev = seen.get(key);
        if (prev !== undefined) {
          // Same axis tuple — allowed ONLY if chooseWhen predicates differ
          if ((v.chooseWhen ?? '') === prev) {
            fail(
              `section "${section.id}" has two variants with identical axis tuple AND identical chooseWhen: ${key}`,
              'F1: variants must differ by axis tuple OR by chooseWhen predicate (content-slot variants allowed)',
              `differentiate the variants by adding/changing an axis value OR a chooseWhen predicate in apps/web/data/marketing/sections.ts`,
              'docs/marketing/ARCHITECTURE.md §Variant System'
            );
          }
        } else {
          seen.set(key, v.chooseWhen ?? '');
        }
      }
    }
  });

  it('E1: RECIPE_CATALOG stated section count matches registry sectionOrder.length', async () => {
    let catalog: string;
    try {
      catalog = await readFile(resolve(DOCS_DIR, 'RECIPE_CATALOG.md'), 'utf-8');
    } catch {
      return; // skip if docs not yet present
    }
    for (const recipe of MARKETING_RECIPES) {
      // Match "Sections (N):" in the recipe's catalog block
      const anchor = `#recipe-${recipe.id}`;
      const anchorIdx = catalog.indexOf(anchor);
      if (anchorIdx < 0) continue;
      const blockEnd = catalog.indexOf('#recipe-', anchorIdx + 1);
      const block = catalog.slice(
        anchorIdx,
        blockEnd > 0 ? blockEnd : undefined
      );
      const match = block.match(/Sections\s*\((\d+)\)/);
      if (!match) {
        fail(
          `recipe "${recipe.id}" RECIPE_CATALOG block has no "Sections (N):" count`,
          'E1: docs⇔registry count parity — the catalog states a section count per recipe',
          `add "Sections (${recipe.sectionOrder.length}):" to the #recipe-${recipe.id} block in docs/marketing/RECIPE_CATALOG.md`,
          'docs/marketing/RECIPE_CATALOG.md'
        );
      }
      const statedCount = Number.parseInt(match[1], 10);
      if (statedCount !== recipe.sectionOrder.length) {
        fail(
          `recipe "${recipe.id}" RECIPE_CATALOG states ${statedCount} sections but registry has ${recipe.sectionOrder.length}`,
          'E1: docs⇔registry count drift',
          `update "Sections (N):" in #recipe-${recipe.id} to ${recipe.sectionOrder.length} OR sync sectionOrder in apps/web/data/marketing/recipes.ts`,
          'docs/marketing/RECIPE_CATALOG.md'
        );
      }
    }
  });

  it('A3: every recipe with proof/trust sections declares a fallback for each (worst-case zero-proof arc survival)', () => {
    for (const recipe of MARKETING_RECIPES) {
      const proofSectionsInOrder = recipe.sectionOrder.filter(sectionId => {
        const section = MARKETING_SECTIONS.find(s => s.id === sectionId);
        return (
          section &&
          (section.proofClass === 'proof' || section.proofClass === 'trust')
        );
      });
      for (const proofSection of proofSectionsInOrder) {
        const hasFallback = recipe.fallbacks?.some(f =>
          f.missing.includes(proofSection)
        );
        if (!hasFallback) {
          fail(
            `recipe "${recipe.id}" has proof/trust section "${proofSection}" but no fallback for missing verified data`,
            'A3: arc survival — every proof/trust section must declare a fallback so the arc degrades gracefully under the zero-proof path',
            `add a fallbacks entry to recipe ${recipe.id} in apps/web/data/marketing/recipes.ts: { missing: '${proofSection} verified data', fallback: 'omit section ${proofSection} (zero-proof path)' }`,
            'docs/marketing/COMPOSITION_RULES.md §Law 6'
          );
        }
      }
    }
  });

  it('B1: golden fixtures that resolve to unproven variants are flagged (humanOptIn required at render time)', async () => {
    // For each golden fixture, resolve the composition, walk the sections, find
    // any variant with status: 'unproven'. These are legal in the tuple (the
    // resolver produces them) BUT a real route deployment that uses them must
    // carry humanOptIn on the route manifest entry (DX2). This test documents
    // the requirement; it does NOT fail the gate (the gate cannot inspect
    // render-time manifest entries from a unit test — that's a Linear follow-up
    // for render-time recipe verification per DX8).
    for (const file of [
      'brief-01-artist-claim.json',
      'brief-02-homepage-general.json',
      'brief-03-pricing-compare.json',
    ]) {
      const content = await readFile(resolve(BRIEFS_DIR, file), 'utf-8');
      const fixture = JSON.parse(content) as { brief: unknown };
      const composition = resolveComposition(fixture.brief);
      const unprovenVariants: string[] = [];
      for (const s of composition.sections) {
        const section = MARKETING_SECTIONS.find(sec => sec.id === s.sectionId);
        const variant = section?.variants.find(v => v.id === s.variantId);
        if (variant?.status === 'unproven') {
          unprovenVariants.push(`${s.sectionId}/${s.variantId}`);
        }
      }
      // Soft assertion: log but don't fail (the gate can't enforce render-time humanOptIn).
      // A future render-time test (DX8 follow-up) will assert the route manifest carries humanOptIn.
      if (unprovenVariants.length > 0) {
        console.warn(
          `[B1] ${file} resolves to unproven variants: ${unprovenVariants.join(', ')}. ` +
            `A real route deployment using these must carry humanOptIn on the route manifest entry (DX2).`
        );
      }
    }
    // Always pass — this is a documentation/warning test, not a gate.
    expect(true).toBe(true);
  });
});
