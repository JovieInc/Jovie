import type { ReactNode } from 'react';
import {
  HomepageArtistHero,
  HomepageFanStates,
  HomepageOfferClose,
} from '@/components/homepage/HomepageArtistProfile';
import { HOMEPAGE_COPY } from '@/data/homepageCopy';
import { HOMEPAGE_FAN_STATES_COPY } from '@/data/homepageFanStatesCopy';
import type {
  MarketingPageSection,
  MarketingPageSections,
} from '@/lib/content-records/marketing-page';

/**
 * Renders a homepage spec (`lib/content-records/marketing-page.ts`) with the
 * registered DS section components. A spec only fills copy slots and picks
 * order; components, layout, offer facts, and locked lines stay in code.
 */

function renderSection(
  entry: MarketingPageSection,
  headingId: string,
  claimAction: string
): ReactNode {
  switch (entry.section) {
    case 'hero':
      return (
        <HomepageArtistHero
          key='hero'
          headingId={headingId}
          copy={{
            ...HOMEPAGE_COPY.hero,
            subhead: entry.copy.subhead,
            claim: {
              ...HOMEPAGE_COPY.hero.claim,
              action: entry.copy.claimAction,
            },
          }}
        />
      );
    case 'product-gallery':
      return (
        <HomepageFanStates
          key='product-gallery'
          copy={{ ...HOMEPAGE_FAN_STATES_COPY, headline: entry.copy.headline }}
        />
      );
    case 'cta':
      return (
        <HomepageOfferClose
          key='cta'
          offer={{
            ...HOMEPAGE_COPY.offer,
            headline: entry.copy.headline,
            plansLink: {
              ...HOMEPAGE_COPY.offer.plansLink,
              label: entry.copy.plansLinkLabel,
            },
          }}
          close={{ subhead: entry.copy.subhead }}
          claim={{
            ...HOMEPAGE_COPY.hero.claim,
            action: claimAction,
          }}
        />
      );
  }
}

export function HomepageSpecSections({
  sections,
  headingId = 'home-hero-heading',
}: Readonly<{
  sections: MarketingPageSections;
  headingId?: string;
}>) {
  // The closing claim reuses the hero's claim label so the two stay identical.
  const hero = sections.find(s => s.section === 'hero');
  const claimAction =
    hero?.section === 'hero'
      ? hero.copy.claimAction
      : HOMEPAGE_COPY.hero.claim.action;
  return (
    <>{sections.map(entry => renderSection(entry, headingId, claimAction))}</>
  );
}
