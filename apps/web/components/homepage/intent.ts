export const HOMEPAGE_INTENT_KEY = 'jovie_homepage_intent';

export const HOMEPAGE_INTENT_EXPERIMENT_ID = 'homepage_intent_pills_v1';
export const HOMEPAGE_INTENT_VARIANT_ID = 'release_assets_v1';

export type HomepagePillId =
  | 'create_release_page'
  | 'generate_album_art'
  | 'generate_playlist_pitch'
  | 'plan_a_release';

export interface HomepagePill {
  readonly id: HomepagePillId;
  readonly label: string;
  readonly insertedPrompt: string;
}

export const PILLS: readonly HomepagePill[] = [
  {
    id: 'create_release_page',
    label: 'Create release page',
    insertedPrompt: 'Create a release page for ',
  },
  {
    id: 'generate_album_art',
    label: 'Generate album art',
    insertedPrompt: 'Generate album art for ',
  },
  {
    id: 'generate_playlist_pitch',
    label: 'Generate playlist pitch',
    insertedPrompt: 'Generate a playlist pitch for ',
  },
  {
    id: 'plan_a_release',
    label: 'Plan a release',
    insertedPrompt: 'Plan a release for ',
  },
] as const;

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
