import type { ReleaseViewModel } from '@/lib/discography/types';
import { parseAlbumArtTitle } from './title-parser';
import type {
  AlbumArtBrandKitRecord,
  AlbumArtTemplateLock,
  ParsedAlbumArtTitle,
} from './types';

export function findMatchingReleaseFamilyTemplate(params: {
  readonly releaseId?: string;
  readonly title: string;
  readonly releases: readonly ReleaseViewModel[];
}): {
  readonly parsedTitle: ParsedAlbumArtTitle;
  readonly template: AlbumArtTemplateLock | null;
  readonly sourceReleaseId: string | null;
} {
  const parsedTitle = parseAlbumArtTitle(params.title);

  if (!parsedTitle.versionLabel) {
    return {
      parsedTitle,
      template: null,
      sourceReleaseId: null,
    };
  }

  const match = params.releases.find(release => {
    if (release.id === params.releaseId || !release.albumArtTemplate) {
      return false;
    }

    return (
      release.albumArtTemplate.normalizedBaseTitle ===
      parsedTitle.normalizedBaseTitle
    );
  });

  return {
    parsedTitle,
    template: match?.albumArtTemplate ?? null,
    sourceReleaseId: match?.id ?? null,
  };
}

export function findDefaultArtistBrandKit(
  brandKits: readonly AlbumArtBrandKitRecord[]
): AlbumArtBrandKitRecord | null {
  return brandKits.find(brandKit => brandKit.isDefault) ?? brandKits[0] ?? null;
}
