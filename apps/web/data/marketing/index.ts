/**
 * Marketing Architecture Registry — canonical barrel export.
 *
 * The single source of truth for autonomous agents. Per the amended charter
 * (GOAL.md D1=B, DX1), the registry owns ALL normative rules: chooseWhen,
 * legality, ordering, ctaCadence, decision table, lifecycle, hierarchy
 * contracts, degradation ladders. Docs under docs/marketing/ own rationale
 * only and link by stable id.
 *
 * AGENT_GUIDE.md (docs/marketing/AGENT_GUIDE.md) is the sole entrypoint for
 * consumer agents (≤400 lines). The contract: a composition needs ONLY that
 * file + this registry (apps/web/data/marketing/).
 *
 * Stability contract: MARKETING_SPEC_VERSION. Section/variant/recipe ids are
 * kebab-case (regex-asserted in the manifest gate). Adding = minor bump;
 * removing/deprecating = major bump + lifecycle field + canon precedence update.
 *
 * Inherited invariants (NOT restated here — see AGENT_GUIDE.md §Inherited):
 *   - dark-only theme (charter delta #9; DESIGN.md System A)
 *   - fully static: revalidate = false (.claude/rules/ui.md)
 *   - copy-in-data files (apps/web/data/*Copy.ts pattern)
 *   - one body face, one container width ('page' | 'prose'), spacing-only transitions
 */

export type {
  MarketingBrief,
  MarketingComposition,
  MarketingCompositionSection,
} from './composition';
export {
  MARKETING_SPEC_VERSION,
  MarketingBriefSchema,
  MarketingCompositionSchema,
  MarketingCompositionSectionSchema,
  resolveComposition,
} from './composition';
export type {
  GrayscaleWireframeSpec,
  ModelUsageEstimate,
  ProposedSectionComment,
  ProposedSectionId,
  ProposedSectionRecord,
  ProposedSectionStatus,
  RegistryTaskContract,
} from './designGaps';
export { getProposedSection, PROPOSED_SECTIONS } from './designGaps';
export type {
  ArcBeat,
  CtaCadence,
  MarketingRecipe,
  PageHierarchyContract,
  RecipeId,
  RecipeStatus,
} from './recipes';
export {
  getMarketingRecipe,
  getRecipeSectionOrder,
  isProvenRecipe,
  MARKETING_RECIPE_IDS,
  MARKETING_RECIPES,
} from './recipes';
export type {
  RouteManifestEntry,
  RouteRecipeParityReport,
} from './routeManifest';
export {
  DEPRECATION_RATCHET_BASELINE,
  EXEMPTION_RATCHET_BASELINE,
  getRouteManifestEntry,
  getRouteRecipeParity,
  isExempt,
  isRecipeRoute,
  MARKETING_ROUTE_MANIFEST,
} from './routeManifest';
export type {
  AudienceLegality,
  ContentBudget,
  DegradationLadder,
  MarketingAudience,
  MarketingSection,
  MarketingSectionId,
  MarketingVariant,
  ProofClass,
  VariantAlignment,
  VariantColumns,
  VariantDensity,
  VariantLayout,
  VariantMedia,
  VariantMediaPosition,
  VariantStatus,
} from './sections';
export {
  getDefaultVariant,
  getMarketingSection,
  getVariant,
  getVariants,
  hasRequiredPrior,
  isLegalAfter,
  isLegalForAudience,
  isProofClass,
  MARKETING_DEGRADATION_LADDERS,
  MARKETING_SECTION_IDS,
  MARKETING_SECTIONS,
} from './sections';
