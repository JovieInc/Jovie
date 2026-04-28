export const HOMEPAGE_INTENT_KEY = 'jovie_homepage_intent';

export const HOMEPAGE_INTENT_EXPERIMENT_ID = 'homepage_intent_pills_v1';
export const HOMEPAGE_INTENT_VARIANT_ID = 'release_assets_v1';

export type HomepagePillId =
  | 'plan_a_release'
  | 'generate_album_art'
  | 'pitch_playlists'
  | 'build_artist_profile'
  | 'analyze_momentum';

export interface HomepagePill {
  readonly id: HomepagePillId;
  readonly label: string;
  readonly insertedPrompt: string;
}

export const PILLS: readonly HomepagePill[] = [
  {
    id: 'plan_a_release',
    label: 'Plan a release',
    insertedPrompt: 'Plan a release for ',
  },
  {
    id: 'generate_album_art',
    label: 'Generate album art',
    insertedPrompt: 'Generate album art for ',
  },
  {
    id: 'pitch_playlists',
    label: 'Pitch playlists',
    insertedPrompt: 'Pitch playlists for ',
  },
  {
    id: 'build_artist_profile',
    label: 'Build artist profile',
    insertedPrompt: 'Build artist profile for ',
  },
  {
    id: 'analyze_momentum',
    label: 'Analyze momentum',
    insertedPrompt: 'Analyze momentum for ',
  },
] as const;

export const HERO_COPY = {
  eyebrow: 'Meet Jovie',
  headline: 'Drop more music, with less work.',
  subhead: 'Release music faster and grow your audience effortlessly.',
} as const;

export interface HomepageIntent {
  readonly source: 'homepage';
  readonly finalPrompt: string;
  readonly pillId: HomepagePillId | null;
  readonly pillLabel: string | null;
  readonly insertedPrompt: string | null;
  readonly experimentId: typeof HOMEPAGE_INTENT_EXPERIMENT_ID;
  readonly variantId: typeof HOMEPAGE_INTENT_VARIANT_ID;
  readonly createdAt: string;
}
