// Atomic Design - Organisms
// Complex combinations of molecules and atoms
// Named exports for tree-shaking (no `export *`)

export type { AvatarUploadableProps } from './AvatarUploadable';
export { AvatarUploadable } from './AvatarUploadable';
export type { BenefitsSectionProps } from './BenefitsSection';
export { BenefitsSection } from './BenefitsSection';
export { BrandingBadge } from './BrandingBadge';
export { CookieBannerSection } from './CookieBannerSection';
export { CookieModal } from './CookieModal';
export type { CTASectionProps } from './CTASection';
export { CTASection } from './CTASection';
// Migrated from atoms (uses hooks/Sentry/router - atomic design compliance)
export { DashboardErrorFallback } from './DashboardErrorFallback';
export type { DeferredSectionProps } from './DeferredSection';
export { DeferredSection } from './DeferredSection';
// Migrated from /ui
export type { EmptyStateProps } from './EmptyState';
export { EmptyState } from './EmptyState';
export { default as ErrorBoundary } from './ErrorBoundary';
export type {
  FeaturedCreator,
  FeaturedCreatorsSectionProps,
} from './FeaturedArtistsSection';
export {
  FeaturedArtistsSection,
  FeaturedCreatorsSection,
} from './FeaturedArtistsSection';
export type { HeaderNavProps } from './HeaderNav';
export { HeaderNav } from './HeaderNav';
export type { HeroSectionProps } from './HeroSection';
export { HeroSection } from './HeroSection';
export type { HowItWorksSectionProps } from './HowItWorksSection';
export { HowItWorksSection } from './HowItWorksSection';
export type { ListenSectionProps } from './ListenSection';
export { ListenSection } from './ListenSection';
export { PaySection } from './PaySection';
export { ProfileSection } from './ProfileSection';
export type {
  ProfileNotificationsContextValue,
  ProfileShellProps,
  UseProfileShellReturn,
} from './profile-shell';
export {
  ProfileNotificationsContext,
  ProfileShell,
  SOCIAL_NETWORK_PLATFORMS,
  useProfileNotifications,
  useProfileShell,
} from './profile-shell';
export type {
  PublicSurfaceFooterProps,
  PublicSurfaceHeaderProps,
  PublicSurfaceShellProps,
  PublicSurfaceStageProps,
} from './public-surface';
export {
  PublicSurfaceFooter,
  PublicSurfaceHeader,
  PublicSurfaceShell,
  PublicSurfaceStage,
} from './public-surface';
export type {
  HandleValidationState,
  SmartHandleInputProps,
} from './SmartHandleInput';
export { SmartHandleInput } from './SmartHandleInput';
export { SocialBar } from './SocialBar';
export type {
  UserButtonProps,
  UserDisplayInfo,
  UseUserButtonProps,
  UseUserButtonReturn,
} from './user-button';
export { UserButton, useUserButton } from './user-button';
