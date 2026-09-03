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
 *   - dark-first editorial language on System B tokens
 *   - fully static: revalidate = false (.claude/rules/ui.md)
 *   - copy-in-data files (apps/web/data/*Copy.ts pattern)
 *   - one body face, one container width ('page' | 'prose'), spacing-only transitions
 */

export type {
  MarketingPenRegistryIssue,
  MarketingPenRegistryIssueCode,
  MarketingRecipeRegistryEntry,
  MarketingRegistryEntry,
  MarketingRegistryKind,
  MarketingSectionRegistryEntry,
  MarketingShellRegistryEntry,
} from './componentRegistry';
export {
  getMarketingRegistryEntry,
  getMarketingSectionRegistryEntry,
  MARKETING_COMPONENT_REGISTRY,
  MARKETING_COMPOSITION_CONTRACT,
  MARKETING_RECIPE_REGISTRY,
  MARKETING_SECTION_REGISTRY,
  MARKETING_SHELL_REGISTRY,
  validateMarketingPenRegistry,
} from './componentRegistry';
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
  MarketingCompositionValidationCode,
  MarketingCompositionValidationIssue,
  MarketingCompositionValidationResult,
} from './compositionValidation';
export {
  assertMarketingComposition,
  validateMarketingComposition,
} from './compositionValidation';
export type {
  MarketingCopyAction,
  MarketingCopyAuditIssue,
  MarketingCopyClaim,
  MarketingCopyInstructionTokens,
  MarketingCopyLineBinding,
  MarketingCopyLineRole,
  MarketingCopyOutcome,
  MarketingCopyPageBrief,
  MarketingCopyPageDraft,
  MarketingCopyPanelReview,
  MarketingCopyReviewRole,
  MarketingCopySectionBrief,
  MarketingCopySectionDraft,
  MarketingCopySemanticAudit,
  MarketingCopySemanticAuditOptions,
  MarketingCopySemanticEnforcement,
  MarketingCopyTasteDecision,
  MarketingCopyTasteInboxItem,
  MarketingCopyTasteProfile,
  MarketingCopyTasteSignal,
  MarketingCopyTasteTag,
  MarketingCopyVisibleCopy,
} from './copy';
export {
  applyMarketingCopyTasteDecision,
  auditMarketingCopyPage,
  auditMarketingCopyPanel,
  auditMarketingCopySemantics,
  createEmptyMarketingCopyTasteProfile,
  createMarketingCopyReviewDigest,
  createMarketingCopyTasteInboxItem,
  MARKETING_COPY_LINE_ROLES,
  MARKETING_COPY_REVIEW_ROLES,
  MARKETING_COPY_SEMANTIC_ENFORCEMENTS,
  MARKETING_COPY_SPEC_VERSION,
  MARKETING_COPY_TASTE_TAGS,
} from './copy';
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
  MarketingCreativeRole,
  MarketingGateReceipt,
  MarketingGenerationFinding,
  MarketingGenerationStage,
  MarketingModelCandidate,
  MarketingModelCapability,
  MarketingNarrativePlan,
  MarketingNarrativeSectionPlan,
  MarketingTasteGateId,
} from './generation';
export {
  auditMarketingNarrativePlan,
  auditMarketingTasteAdmission,
  MARKETING_ASSET_GENERATION_COLOR_CONTRACT,
  MARKETING_CREATIVE_ROLES,
  MARKETING_GENERATION_SPEC_VERSION,
  MARKETING_GENERATION_STAGES,
  MARKETING_MODEL_CAPABILITIES,
  MARKETING_ROLE_REQUIREMENTS,
  MARKETING_STAGE_ATTEMPT_LIMITS,
  MARKETING_TASTE_GATE_IDS,
  MARKETING_VISUAL_REVIEW_COLOR_CONTRACT,
  selectMarketingModelCandidate,
} from './generation';
export type {
  HomepageAssetShootout,
  HomepageAssetShootoutEntry,
  HomepageFounderDecision,
  HomepageFounderDecisionStatus,
  HomepageGenerationRun,
  HomepageIsolatedProposal,
  HomepageIsolatedProposalFrame,
  HomepageLiveBaseline,
  HomepagePenBaseline,
  HomepageProposalId,
  HomepageProposalSectionId,
  HomepageRedesignFinding,
  HomepageRedesignViewportId,
  HomepageSectionPromotionRequest,
  LiveHomepageSectionId,
} from './homepageRedesign';
export {
  auditHomepageRedesignPhase1,
  auditHomepageSectionPromotion,
  auditLiveHomepageSource,
  getHomepageIsolatedProposal,
  HOMEPAGE_ASSET_SHOOTOUT,
  HOMEPAGE_BEST_PROPOSAL_ID,
  HOMEPAGE_FOUNDER_DECISION,
  HOMEPAGE_GENERATION_RUN,
  HOMEPAGE_ISOLATED_PROPOSALS,
  HOMEPAGE_LIVE_BASELINE,
  HOMEPAGE_PEN_BASELINE,
  HOMEPAGE_PROPOSAL_IDS,
  HOMEPAGE_PROPOSAL_NARRATIVE_SOURCE,
  HOMEPAGE_PROPOSAL_SECTION_IDS,
  HOMEPAGE_REDESIGN_CONTRACT_VERSION,
  HOMEPAGE_REDESIGN_ISSUE_ID,
  HOMEPAGE_REDESIGN_PHASE,
  HOMEPAGE_REDESIGN_VIEWPORTS,
  LIVE_HOMEPAGE_ROUTE,
  LIVE_HOMEPAGE_SECTION_IDS,
  LIVE_HOMEPAGE_SECTION_MARKERS,
  LIVE_HOMEPAGE_SOURCE_FILES,
  STAGED_HOMEPAGE_ROUTE,
  STAGED_HOMEPAGE_SOURCE_FILES,
  START_GOLDEN_PATH_ROUTE,
} from './homepageRedesign';
export type {
  JovieForbiddenControllableHue,
  JovieHueCorridor,
  JovieImageColorControl,
  JovieImageColorDecision,
  JovieImageColorFailureAction,
  JovieImageColorFinding,
  JovieImageColorPolicy,
  JovieImageColorRequestedAction,
  JovieImageColorSalience,
  JovieImageProtectedColorClass,
  JovieImageSceneColorRole,
  JovieImageSkinMaterialEvaluation,
  JovieImageSubjectSeparationEvaluation,
  JovieOklchColorReference,
  JovieOklchColorSample,
  JovieScenePaletteReference,
  JovieSubjectSeparationRequirement,
  JovieUiColorAnchor,
} from './imageColorPolicy';
export {
  auditJovieImageColorDecision,
  formatJovieImageColorPolicyForPrompt,
  isForbiddenControllableSceneColor,
  isHueInCorridor,
  JOVIE_IMAGE_COLOR_POLICY,
  JOVIE_IMAGE_COLOR_POLICY_SCHEMA,
  JOVIE_IMAGE_COLOR_POLICY_VERSION,
  resolveJovieSceneColorRole,
} from './imageColorPolicy';
export type {
  MarketingPageContract,
  MarketingPageContractRouteGlob,
} from './pageContracts';
export {
  getMarketingPageContractForPathname,
  getMarketingPageContractForRouteGlob,
  MARKETING_PAGE_CONTRACT_ROUTE_GLOBS,
  MARKETING_PAGE_CONTRACTS,
  normalizeMarketingPathname,
} from './pageContracts';
export type { MarketingPenContractId } from './penContracts';
export {
  MARKETING_CONTAINER_PEN_CONTRACT_BY_WIDTH,
  MARKETING_PEN_CONTRACT_IDS,
  marketingPenSelector,
} from './penContracts';
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
  MarketingExactPublicRouteTarget,
  MarketingRouteCaptureState,
  MarketingRouteCaptureViewport,
  MarketingRouteDisposition,
  MarketingRouteDispositionLedgerEntry,
  MarketingRouteHealthTarget,
  RouteManifestEntry,
  RouteRecipeParityReport,
} from './routeManifest';
export {
  DEPRECATION_RATCHET_BASELINE,
  EXEMPTION_RATCHET_BASELINE,
  getMarketingRouteHealthTarget,
  getRouteManifestEntry,
  getRouteRecipeParity,
  isExempt,
  isRecipeRoute,
  MARKETING_EXACT_PUBLIC_ROUTE_TARGETS,
  MARKETING_ROUTE_DISPOSITION_LEDGER,
  MARKETING_ROUTE_HEALTH_TARGETS,
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
