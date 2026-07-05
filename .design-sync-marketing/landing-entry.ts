// Narrow design-sync entry: the artist-profile landing surface only (JOV-3502 Stage A).
// Scoped to what ArtistProfileLandingPage composes so the converter bundles ONLY these
// sections — not the rest of components/marketing (homepage-v2, friday-rhythm →
// next/dynamic, artist-notifications), which pull Next internals into a browser bundle.
// Relative imports (not @/…) so the entry file itself needs no tsconfig-paths resolution;
// the sections' own internal @/… imports still resolve via cfg.tsconfig. window.JovieMarketing.* = these.

export { ArtistProfileCaptureSection } from '../apps/web/components/marketing/artist-profile/ArtistProfileCaptureSection';
export { ArtistProfileFaq } from '../apps/web/components/marketing/artist-profile/ArtistProfileFaq';
export { ArtistProfileFinalCta } from '../apps/web/components/marketing/artist-profile/ArtistProfileFinalCta';
export { ArtistProfileHero } from '../apps/web/components/marketing/artist-profile/ArtistProfileHero';
export { ArtistProfileHeroAdaptiveIntro } from '../apps/web/components/marketing/artist-profile/ArtistProfileHeroAdaptiveIntro';
export { ArtistProfileHowItWorks } from '../apps/web/components/marketing/artist-profile/ArtistProfileHowItWorks';
export { ArtistProfileLandingPage } from '../apps/web/components/marketing/artist-profile/ArtistProfileLandingPage';
export { ArtistProfileMonetizationSection } from '../apps/web/components/marketing/artist-profile/ArtistProfileMonetizationSection';
export { ArtistProfileOutcomesCarousel } from '../apps/web/components/marketing/artist-profile/ArtistProfileOutcomesCarousel';
export { ArtistProfilePayFlowVideoSection } from '../apps/web/components/marketing/artist-profile/ArtistProfilePayFlowVideoSection';
export { ArtistProfileReactivationSection } from '../apps/web/components/marketing/artist-profile/ArtistProfileReactivationSection';
export { ArtistProfileSocialProof } from '../apps/web/components/marketing/artist-profile/ArtistProfileSocialProof';
export { ArtistProfileSpecWall } from '../apps/web/components/marketing/artist-profile/ArtistProfileSpecWall';
