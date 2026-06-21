'use client';

import { useCallback } from 'react';
import { EntityCarousel } from '@/components/organisms/entity-card';
import type { EntityCardModel } from '@/components/organisms/entity-card/types';
import { track } from '@/lib/analytics';

interface ReleaseCatalogCarouselProps {
  readonly items: readonly EntityCardModel[];
  readonly artistHandle: string;
  readonly artistId: string;
  readonly analyticsEnabled?: boolean;
  readonly dataTestId?: string;
}

function isCatalogMusicCard(model: EntityCardModel): boolean {
  return model.kind === 'music' || model.kind === 'video';
}

function resolveReleaseId(model: EntityCardModel): string {
  return model.releaseId ?? model.id;
}

export function ReleaseCatalogCarousel({
  items,
  artistHandle,
  artistId,
  analyticsEnabled = true,
  dataTestId = 'profile-home-carousel',
}: Readonly<ReleaseCatalogCarouselProps>) {
  const handleCardImpression = useCallback(
    (index: number, model: EntityCardModel) => {
      if (!analyticsEnabled || !isCatalogMusicCard(model)) {
        return;
      }

      track('catalog_carousel_card_impression', {
        release_id: resolveReleaseId(model),
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
      if (!analyticsEnabled || !isCatalogMusicCard(model)) {
        return;
      }

      track('catalog_carousel_listen_click', {
        release_id: resolveReleaseId(model),
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
      dataTestId={dataTestId}
      onCardImpression={handleCardImpression}
      onCardClick={handleCardClick}
    />
  );
}
