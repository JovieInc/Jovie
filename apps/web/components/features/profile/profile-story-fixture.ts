import type { Artist } from '@/types/db';
import type { NotificationContentType } from '@/types/notifications';

export const PROFILE_STORY_ARTIST = {
  id: 'artist-1',
  owner_user_id: 'user-1',
  name: 'Tim White',
  handle: 'timwhite',
  spotify_id: '4u',
  image_url: '/images/avatars/tim-white.jpg',
  tagline: 'Producer, songwriter, and after-hours romantic.',
  location: 'Los Angeles',
  hometown: null,
  career_highlights: null,
  is_verified: true,
  active_since_year: null,
  published: true,
  is_featured: false,
  marketing_opt_out: false,
  created_at: '2026-04-24T00:00:00.000Z',
  settings: {
    heroRoleLabel: 'DJ / PRODUCER',
  },
} satisfies Artist;

export const PROFILE_STORY_CONTENT_PREFS: Record<
  NotificationContentType,
  boolean
> = {
  newMusic: true,
  tourDates: false,
  merch: false,
  general: false,
};

export function profileStoryNoop() {
  return undefined;
}
