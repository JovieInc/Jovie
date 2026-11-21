/**
 * Presentation-mode class resolvers for the canonical header nav.
 *
 * Pure helpers extracted from HeaderNav.tsx to keep the owner under the
 * 500-line source ceiling (Company Guards size-500). Registered alongside
 * HeaderNav.tsx in the headers family ownerFiles — the emitted class names
 * are unchanged.
 */
export function getNavLinkVariantClass({
  isHomepagePresentation,
  isMarketingGlass,
}: Readonly<{
  isHomepagePresentation: boolean;
  isMarketingGlass: boolean;
}>) {
  if (isMarketingGlass) {
    return 'marketing-glass-header__nav-link';
  }

  if (isHomepagePresentation) {
    return 'homepage-header-nav-link';
  }

  return 'nav-link-linear';
}

export function getNavGroupVariantClass({
  isHomepagePresentation,
  isMarketingGlass,
}: Readonly<{
  isHomepagePresentation: boolean;
  isMarketingGlass: boolean;
}>) {
  if (isMarketingGlass) {
    return 'marketing-glass-header__nav';
  }

  if (isHomepagePresentation) {
    return 'homepage-header-nav-group';
  }

  return 'gap-1 lg:gap-1.5';
}

export function getNavContainerVariantClass({
  containerSize,
  isMarketingGlass,
}: Readonly<{
  containerSize: 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'homepage' | undefined;
  isMarketingGlass: boolean;
}>) {
  if (isMarketingGlass) {
    return 'public-container marketing-glass-header__shell';
  }

  if (containerSize === 'homepage') {
    return 'max-w-public-content lg:px-0';
  }

  return 'max-w-public-content';
}
