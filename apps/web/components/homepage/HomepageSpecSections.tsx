import { Fragment, type ReactNode } from 'react';
import {
  HomepageInviteClose,
  HomepageProfileChapter,
  HomepageReleasesChapter,
  HomepageStoryHero,
} from '@/components/homepage/HomepageEditorial';
import { SpecsChapter } from '@/components/homepage/v3/SpecsChapter';
import { StageMotion } from '@/components/homepage/v3/StageMotion';
import {
  HOMEPAGE_EDITORIAL_COPY,
  HOMEPAGE_PRODUCT_UI,
} from '@/data/homepageEditorialCopy';
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
      // The specs chapter is code-owned (its numbers derive from the DSP
      // registry, so it has no copy slots) and follows the releases chapter.
      return (
        <Fragment key='product-gallery'>
          <HomepageReleasesChapter copy={entry.copy} />
          <SpecsChapter />
        </Fragment>
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
  return (
    <>
      {sections.map(entry => renderSection(entry, headingId))}
      <StageMotion
        paletteQuery={HOMEPAGE_PRODUCT_UI.palette.query}
        paletteTarget={HOMEPAGE_PRODUCT_UI.palette.queryTarget}
      />
    </>
  );
}
