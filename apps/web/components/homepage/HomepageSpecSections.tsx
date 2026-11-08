import type { ReactNode } from 'react';
import {
  HomepageInviteClose,
  HomepageProfileChapter,
  HomepageReleasesChapter,
  HomepageStoryHero,
} from '@/components/homepage/HomepageEditorial';
import { HOMEPAGE_EDITORIAL_COPY } from '@/data/homepageEditorialCopy';
import type {
  MarketingPageSection,
  MarketingPageSections,
} from '@/lib/content-records/marketing-page';

/**
 * Renders a homepage spec (`lib/content-records/marketing-page.ts`) with the
 * registered DS section components. A spec only fills copy slots and picks
 * order; components, layout, imagery, links and the locked headline stay in
 * code.
 */
function renderSection(
  entry: MarketingPageSection,
  headingId: string
): ReactNode {
  switch (entry.section) {
    case 'hero':
      return (
        <HomepageStoryHero
          key='hero'
          headingId={headingId}
          copy={{ ...HOMEPAGE_EDITORIAL_COPY.hero, ...entry.copy }}
        />
      );
    case 'feature-split':
      return <HomepageProfileChapter key='feature-split' copy={entry.copy} />;
    case 'product-gallery':
      return (
        <HomepageReleasesChapter key='product-gallery' copy={entry.copy} />
      );
    case 'cta':
      return <HomepageInviteClose key='cta' copy={entry.copy} />;
  }
}

export function HomepageSpecSections({
  sections,
  headingId = 'home-hero-heading',
}: Readonly<{
  sections: MarketingPageSections;
  headingId?: string;
}>) {
  return <>{sections.map(entry => renderSection(entry, headingId))}</>;
}
