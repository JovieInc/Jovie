import { BOOK_LAUNCH_PLAYBOOK } from './book-launch';
import { MUSIC_RELEASE_PLAYBOOK } from './music-release';
import { PODCAST_EPISODE_PLAYBOOK } from './podcast-episode';
import { SONG_WEEKLY_DROPS_PLAYBOOK } from './song-weekly-drops';
import { STARTUP_FEATURE_KIT_PLAYBOOK } from './startup-feature-kit';
import type { PlaybookId, PlaybookTemplate } from './types';
import { YOUTUBE_VIDEO_PLAYBOOK } from './youtube-video';

export const PLAYBOOK_TEMPLATES: Readonly<
  Record<PlaybookId, PlaybookTemplate>
> = {
  'music-release': MUSIC_RELEASE_PLAYBOOK,
  'youtube-video': YOUTUBE_VIDEO_PLAYBOOK,
  'podcast-episode': PODCAST_EPISODE_PLAYBOOK,
  'book-launch': BOOK_LAUNCH_PLAYBOOK,
  'song-weekly-drops': SONG_WEEKLY_DROPS_PLAYBOOK,
  'startup-feature-kit': STARTUP_FEATURE_KIT_PLAYBOOK,
};

/** Mirrors the `creator_type` enum without importing server schema. */
export type PlaybookCreatorType =
  | 'artist'
  | 'podcaster'
  | 'influencer'
  | 'creator';

const DEFAULT_PLAYBOOK_BY_CREATOR_TYPE: Readonly<
  Record<PlaybookCreatorType, PlaybookId>
> = {
  artist: 'music-release',
  podcaster: 'podcast-episode',
  influencer: 'youtube-video',
  creator: 'youtube-video',
};

export function isPlaybookId(value: unknown): value is PlaybookId {
  return typeof value === 'string' && Object.hasOwn(PLAYBOOK_TEMPLATES, value);
}

export function getPlaybookTemplate(id: PlaybookId): PlaybookTemplate {
  return PLAYBOOK_TEMPLATES[id];
}

/** Music release stays the default when the creator type is unknown. */
export function getDefaultPlaybookId(
  creatorType: PlaybookCreatorType | null | undefined
): PlaybookId {
  return creatorType
    ? DEFAULT_PLAYBOOK_BY_CREATOR_TYPE[creatorType]
    : 'music-release';
}

/** Every template, with the creator's default first. */
export function listPlaybookTemplates(
  creatorType: PlaybookCreatorType | null | undefined
): PlaybookTemplate[] {
  const defaultId = getDefaultPlaybookId(creatorType);
  const all = Object.values(PLAYBOOK_TEMPLATES);
  return [
    PLAYBOOK_TEMPLATES[defaultId],
    ...all.filter(template => template.id !== defaultId),
  ];
}
