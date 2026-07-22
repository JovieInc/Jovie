'use client';

import { type ReactNode, useCallback } from 'react';
import { EntityCarousel } from '@/components/organisms/entity-card';
import type { EntityCardModel } from '@/components/organisms/entity-card/types';
import { track } from '@/lib/analytics';

interface ReleaseCatalogCarouselProps {
  readonly items: readonly EntityCardModel[];
  readonly artistHandle: string;
  readonly artistId: string;
  readonly analyticsEnabled?: boolean;
  readonly dataTestId?: string;
  /** Featured first card (PAC) rendered in the same card geometry. */
  readonly leading?: ReactNode;
  /** Final card (alerts) rendered in the same card geometry. */
  readonly trailing?: ReactNode;
}

function isCatalogReleaseCard(
  model: EntityCardModel
): model is EntityCardModel & { readonly releaseId: string } {
  return (
    (model.kind === 'music' || model.kind === 'video') &&
    typeof model.releaseId === 'string' &&
    model.releaseId.length > 0
  );
}

export function ReleaseCatalogCarousel({
  items,
  artistHandle,
  artistId,
  analyticsEnabled = true,
  dataTestId = 'profile-home-carousel',
  leading,
  trailing,
}: Readonly<ReleaseCatalogCarouselProps>) {
  const handleCardImpression = useCallback(
    (index: number, model: EntityCardModel) => {
      if (!analyticsEnabled || !isCatalogReleaseCard(model)) {
        return;
      }

      track('catalog_carousel_card_impression', {
        release_id: model.releaseId,
        index,
        artist_handle: artistHandle,
        artist_id: artistId,
        profile_id: artistId,
        profile_slug: artistHandle,
        release_slug: model.id,
        is_featured: index === 0,
        current_route_tab: 'home',
      });
    },
    [analyticsEnabled, artistHandle, artistId]
  );

  const handleCardClick = useCallback(
    (index: number, model: EntityCardModel) => {
      if (!analyticsEnabled || !isCatalogReleaseCard(model)) {
        return;
      }

      track('catalog_carousel_listen_click', {
        release_id: model.releaseId,
        index,
        artist_handle: artistHandle,
        artist_id: artistId,
        profile_id: artistId,
        profile_slug: artistHandle,
        release_slug: model.id,
        is_featured: index === 0,
        current_route_tab: 'home',
        cta_location: 'catalog_carousel',
      });
    },
    [analyticsEnabled, artistHandle, artistId]
  );

  return (
    <EntityCarousel
      items={items}
      surface='pearl'
      layout='profile-landscape'
      dataTestId={dataTestId}
      leading={leading}
      trailing={trailing}
      // One full-content-width card per snap. The track reaches the shell edge
      // while its padding preserves the profile safe gutter at rest.
      className='-mx-(--page-pad) min-h-0 flex-1 scroll-px-(--page-pad) px-(--page-pad) md:mx-0 md:scroll-px-0 md:px-0'
      onCardImpression={handleCardImpression}
      onCardClick={handleCardClick}
    />
  );
}
