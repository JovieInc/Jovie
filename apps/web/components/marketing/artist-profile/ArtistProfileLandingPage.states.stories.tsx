import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  ARTIST_PROFILE_COPY,
  type ArtistProfileLandingCopy,
} from '@/data/artistProfileCopy';
import { ARTIST_PROFILE_FLAGS } from '@/lib/featureFlags';
import { ArtistProfileLandingPage } from './ArtistProfileLandingPage';

const SPEC_WALL = ARTIST_PROFILE_COPY.specWall;

const RtlCanvas: Decorator = function RtlCanvas(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

function withSpecWall(
  specWall: ArtistProfileLandingCopy['specWall']
): ArtistProfileLandingCopy {
  return { ...ARTIST_PROFILE_COPY, specWall };
}

/**
 * Rendered states of the /artist-profiles composition, focused on the
 * annotated product truth section this file owns. The production full page
 * and hero-only stories live in ArtistProfileLandingPage.stories.tsx.
 */
const meta = {
  title: 'Marketing/Artist Profile/ArtistProfileLandingPage/States',
  component: ArtistProfileLandingPage,
  parameters: { layout: 'fullscreen' },
  args: {
    copy: ARTIST_PROFILE_COPY,
    flags: ARTIST_PROFILE_FLAGS,
    logoPlacement: { page: '/artist-profiles' },
  },
} satisfies Meta<typeof ArtistProfileLandingPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: the annotated truth section with no callouts or related features. */
export const EmptyCallouts: Story = {
  args: {
    copy: withSpecWall({
      headline: SPEC_WALL.headline,
      subhead: SPEC_WALL.subhead,
      callouts: [],
    }),
  },
};

/** Long content: callouts and related features whose copy wraps. */
export const LongContentCallouts: Story = {
  args: {
    copy: withSpecWall({
      ...SPEC_WALL,
      callouts: (SPEC_WALL.callouts ?? []).map(callout => ({
        ...callout,
        title: `${callout.title}, on every screen size and in every release cycle`,
        body: `${callout.body} It stays that way when the next release lands, when a tour is announced and when listeners come back months later.`,
      })),
    }),
  },
};

/** Right-to-left: Arabic callouts in an Arabic document direction. */
export const RtlArabic: Story = {
  args: {
    copy: withSpecWall({
      headline: 'موسيقاك تبقى معًا. والخطوة الصحيحة تتقدم.',
      subhead: 'يمكن للمستمعين اختيار مكان الاستماع والعثور على الحفلات.',
      callouts: [
        { id: 'identity', title: 'يعرفون أنه أنت', body: 'اسمك وصورتك.' },
        {
          id: 'release',
          title: 'الموسيقى الجديدة جاهزة',
          body: 'إصدارك الحالي.',
        },
        { id: 'action', title: 'الخطوة التالية', body: 'تتبع اللحظة.' },
        { id: 'navigation', title: 'كل شيء آخر', body: 'قريب دائمًا.' },
      ],
    }),
  },
  decorators: [RtlCanvas],
};
