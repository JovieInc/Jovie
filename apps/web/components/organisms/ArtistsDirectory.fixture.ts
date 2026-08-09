import { FOUNDER_DEMO_PERSONA } from '@/lib/demo-personas';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import type { ArtistsDirectoryProfile } from './ArtistsDirectory';

export const ARTISTS_DIRECTORY_STORY_PROFILES = [
  {
    id: 'fixture-tim-white',
    username: TIM_WHITE_PROFILE.publicProfileHandle,
    displayName: TIM_WHITE_PROFILE.name,
    avatarUrl: TIM_WHITE_PROFILE.avatarSrc,
    bio: FOUNDER_DEMO_PERSONA.profile.bio,
  },
] as const satisfies readonly ArtistsDirectoryProfile[];
