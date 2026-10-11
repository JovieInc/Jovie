import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { creatorTypeEnum, merchDesignLaneEnum } from '@/lib/db/schema/enums';
import { getCreatorTypeLabel } from '@/types';
import {
  BASE_CREATOR_TYPE,
  CREATOR_PROFESSION_LABELS,
  CREATOR_PROFESSIONS,
  creatorProfessionLabel,
  isCreatorProfession,
  MERCH_LANE_LABELS,
  MUSIC_EVENTS_ROUTE,
  merchLaneLabel,
  RELATED_ARTISTS_LABEL,
  RELATED_CREATORS_LABEL,
  relatedSubjectsLabel,
  SPOTIFY_RELATED_SECTION_TITLE,
  WORK_ROUTE,
} from './vocabulary';

describe('creator vocabulary', () => {
  it('keeps profession labels aligned with the existing creator type helper', () => {
    expect(creatorTypeEnum.enumValues).toEqual([
      'artist',
      'podcaster',
      'influencer',
      'creator',
    ]);
    for (const type of creatorTypeEnum.enumValues) {
      expect(creatorProfessionLabel(type)).toBe(getCreatorTypeLabel(type));
      expect(CREATOR_PROFESSION_LABELS[type]).toBe(getCreatorTypeLabel(type));
    }
  });

  it('treats creator as the one broad type with optional professions', () => {
    expect(BASE_CREATOR_TYPE).toBe('creator');
    expect(creatorTypeEnum.enumValues).toContain(BASE_CREATOR_TYPE);
    expect([...CREATOR_PROFESSIONS].sort()).toEqual([
      'artist',
      'influencer',
      'podcaster',
    ]);
    for (const type of creatorTypeEnum.enumValues) {
      expect(isCreatorProfession(type)).toBe(type !== BASE_CREATOR_TYPE);
    }
    // Every profession keeps a display label.
    for (const profession of CREATOR_PROFESSIONS) {
      expect(CREATOR_PROFESSION_LABELS[profession]).toBeTruthy();
    }
  });

  it('points work and music events at the current routes', () => {
    expect(WORK_ROUTE).toBe(APP_ROUTES.LIBRARY);
    expect(MUSIC_EVENTS_ROUTE).toBe(APP_ROUTES.TOUR_DATES);
  });

  it('labels merch lanes without renaming the enum', () => {
    expect(merchDesignLaneEnum.enumValues).toEqual([
      'band_tour_uniform',
      'fashion_graphic_item',
      'artist_world_artifact',
    ]);
    expect(merchLaneLabel('band_tour_uniform')).toBe('Signature uniform');
    expect(merchLaneLabel('fashion_graphic_item')).toBe('Graphic item');
    expect(merchLaneLabel('artist_world_artifact')).toBe('Identity artifact');
    expect(MERCH_LANE_LABELS.band_tour_uniform).not.toBe('band_tour_uniform');
  });

  it('keeps the Spotify section title and offers a creator label beside it', () => {
    expect(SPOTIFY_RELATED_SECTION_TITLE).toBe('Fans Also Like');
    expect(RELATED_CREATORS_LABEL).toBe('Related creators');
  });

  it('reserves artist framing for music-sourced recommendations', () => {
    expect(RELATED_ARTISTS_LABEL).toBe('Related artists');
    expect(relatedSubjectsLabel(true)).toBe(RELATED_ARTISTS_LABEL);
    expect(relatedSubjectsLabel(false)).toBe(RELATED_CREATORS_LABEL);
  });
});
