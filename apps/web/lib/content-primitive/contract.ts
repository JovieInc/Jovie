/**
 * Content primitive: idea -> script -> launch.
 *
 * One pipeline for everything Jovie writes for an audience. An IDEA lands in
 * Tim's inbox (Summer turns a Linear `content:idea` issue into an Ovie card),
 * an approved idea becomes a SCRIPT, and a certified script LAUNCHES to a
 * channel. Vocabulary follows JovieInc/BubblegumFactory CONTENT.md (formats,
 * pillars, recurring topic families, characters) so audio and video channels
 * plug in later without a new schema.
 *
 * Phase 1 builds exactly one launch target: the jov.ie blog. Every other
 * medium and channel is typed here and rejected at launch.
 */

export const CONTENT_PRIMITIVE_CONTRACT = 'jovie.content-primitive/v1' as const;

/** CONTENT.md "Content Matrix" pillars, plus the artist-growth answer pillar. */
export const CONTENT_PILLARS = [
  'tim_brand',
  'jovie_brand',
  'startup_story',
  'bgf_ip',
  'artist_growth',
] as const;
export type ContentPillar = (typeof CONTENT_PILLARS)[number];

/** CONTENT.md "Recurring Episode Topics" families. */
export const CONTENT_TOPIC_FAMILIES = [
  'artist_industry',
  'startup_life',
  'ai_music',
  'bubblegum_factory',
] as const;
export type ContentTopicFamily = (typeof CONTENT_TOPIC_FAMILIES)[number];

/** CONTENT.md characters. Each maps to one @jovie/copy register. */
export const CONTENT_CHARACTERS = {
  jovie_company: 'jovie-marketing',
  jovie: 'jovie-persona',
  tim: 'founder-tim',
} as const;
export type ContentCharacter = keyof typeof CONTENT_CHARACTERS;

/** Script media. `article` is written; the rest are CONTENT.md show formats. */
export const SCRIPT_MEDIA = [
  'article',
  'short_clip',
  'founder_confessional',
  'podcast_episode',
  'documentary',
  'tv_episode',
] as const;
export type ScriptMedium = (typeof SCRIPT_MEDIA)[number];

export const LAUNCH_CHANNELS = [
  'blog',
  'youtube',
  'youtube_shorts',
  'tiktok',
  'instagram_reels',
  'podcast',
] as const;
export type LaunchChannel = (typeof LAUNCH_CHANNELS)[number];

/** Phase 1: the only built launch target. */
export const ENABLED_LAUNCHES: readonly {
  readonly medium: ScriptMedium;
  readonly channel: LaunchChannel;
}[] = [{ medium: 'article', channel: 'blog' }];

export function isLaunchEnabled(
  medium: ScriptMedium,
  channel: LaunchChannel
): boolean {
  return ENABLED_LAUNCHES.some(
    launch => launch.medium === medium && launch.channel === channel
  );
}

/** A content type is the unit the publish gate learns trust for. */
export type ContentType = 'answer-article';

export type IdeaStatus = 'suggested' | 'approved' | 'rejected' | 'scripted';

export interface ContentIdea {
  readonly contract: typeof CONTENT_PRIMITIVE_CONTRACT;
  readonly id: string;
  readonly contentType: ContentType;
  readonly title: string;
  /** The one belief or answer the piece must land. */
  readonly angle: string;
  readonly topicFamily: ContentTopicFamily;
  readonly pillars: readonly ContentPillar[];
  readonly character: ContentCharacter;
  readonly medium: ScriptMedium;
  readonly channel: LaunchChannel;
  /** Question-map provenance for answer content. */
  readonly questionId: string | null;
  readonly question: string | null;
  readonly evidence: readonly {
    readonly url: string;
    readonly platform: string;
  }[];
  readonly jovieLinks: readonly string[];
  readonly status: IdeaStatus;
}
