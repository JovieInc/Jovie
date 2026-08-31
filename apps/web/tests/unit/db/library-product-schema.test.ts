import { describe, expect, it } from 'vitest';
import {
  artistRuleStatusEnum,
  libraryEntityTypeEnum,
} from '@/lib/db/schema/library-content-graph';
import {
  libraryCollisionDispositionEnum,
  libraryPresenceFindingKindEnum,
  rightsholderEvidenceClassEnum,
  rightsholderEvidenceSourceEnum,
} from '@/lib/db/schema/library-presence';
import { promoDownloads } from '@/lib/db/schema/promo-downloads';

describe('library product schema', () => {
  it('keeps Library graph and rule lifecycle values explicit', () => {
    expect(libraryEntityTypeEnum.enumValues).toEqual([
      'creator_document',
      'release',
      'recording',
      'youtube_video',
      'social_content',
      'merch_product',
      'artist',
      'brand',
      'source_link',
      'offer',
      'provider_placement',
    ]);
    expect(artistRuleStatusEnum.enumValues).toEqual([
      'suggested',
      'active',
      'superseded',
      'revoked',
    ]);
  });

  it('keeps collisions and rightsholder evidence first-class', () => {
    expect(libraryPresenceFindingKindEnum.enumValues).toEqual([
      'repair',
      'collision',
      'placement_opportunity',
    ]);
    expect(libraryCollisionDispositionEnum.enumValues).toContain(
      'not_this_artist'
    );
    expect(libraryCollisionDispositionEnum.enumValues).toContain(
      'not_this_song'
    );
    expect(rightsholderEvidenceClassEnum.enumValues).toEqual([
      'attested',
      'observed',
      'claimed',
    ]);
    expect(rightsholderEvidenceSourceEnum.enumValues).toEqual([
      'artist_attestation',
      'songview',
      'mlc',
      'catalog',
      'other',
    ]);
  });

  it('requires an explicit rights-control attestation field for downloads', () => {
    expect(promoDownloads.rightsControlAttested.notNull).toBe(true);
    expect(promoDownloads.rightsControlAttestedBy).toBeDefined();
    expect(promoDownloads.rightsControlAttestedAt).toBeDefined();
  });
});
