export const SOCIALBLADE_PLATFORMS = [
  'youtube',
  'tiktok',
  'twitch',
  'facebook',
  'instagram',
] as const;

export type SocialBladePlatform = (typeof SOCIALBLADE_PLATFORMS)[number];

export const SOCIALBLADE_KINDS = [
  'statistics',
  'top',
  'grade',
  'sbrank',
  'history-downgrade',
] as const;

export type SocialBladeKind = (typeof SOCIALBLADE_KINDS)[number];

export interface SocialBladeRow {
  readonly platform: SocialBladePlatform;
  readonly kind: SocialBladeKind;
}

export const SOCIALBLADE_ROWS: readonly SocialBladeRow[] =
  SOCIALBLADE_PLATFORMS.flatMap(platform =>
    SOCIALBLADE_KINDS.map(kind => ({ platform, kind }))
  );

export const SOCIALBLADE_DOC_URL = 'https://socialblade.com/developers/docs';
