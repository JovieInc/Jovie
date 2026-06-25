// Narrow design-sync entry: the homepage surface only.
// Scoped to what apps/web/app/(home)/page.tsx composes so the converter bundles
// ONLY these sections. Lazy shims (HomepageWorkspaceSectionLazy,
// HomepageArtistProfilesCarouselLazy, FridayRhythmSectionLazy) are resolved here
// to the real underlying components (the *Lazy.tsx wrappers use next/dynamic with
// ssr:false, which is a Next runtime concern, not a design-system component).
//
// Relative imports (not @/…) so the entry file itself needs no tsconfig-paths
// resolution; the sections' own internal @/… imports still resolve via
// cfg.tsconfig during prebuild. window.JovieHome.* = these exports.

export { HomeBentoPairs } from '../apps/web/components/features/home/HomeBentoPairs';
export { HomeLoopDiagramSection } from '../apps/web/components/features/home/HomeLoopDiagramSection';
export { HomeStatQuoteSection } from '../apps/web/components/features/home/HomeStatQuoteSection';
export { HomeTrustSection } from '../apps/web/components/features/home/HomeTrustSection';
export { HomepageArtistProfilesCarousel } from '../apps/web/components/homepage/HomepageArtistProfilesCarousel';
export { HomepageHeroCommandCenter } from '../apps/web/components/homepage/HomepageHeroCommandCenter';
export { HomepageTrackedLink } from '../apps/web/components/homepage/HomepageTrackedLink';
export { HomepageWorkspaceSection } from '../apps/web/components/homepage/HomepageWorkspaceSection';
export { FaqSection } from '../apps/web/components/marketing/FaqSection';
export { FridayRhythmSection } from '../apps/web/components/marketing/friday-rhythm-section';
export { HomeComposerHero } from '../apps/web/components/marketing/HomeComposerHero';
export {
  HomepageV2FinalCta,
  HomepageV2Pricing,
} from '../apps/web/components/marketing/homepage-v2/HomepageV2Ctas';

// Preview-only dark canvas wrapper (cfg.provider). Not a DS component — excluded
// from the component list because it is never named in cfg.componentSrcMap.
export { DesignSyncCanvas } from './preview-canvas';
