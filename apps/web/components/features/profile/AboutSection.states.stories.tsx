import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import type { PublicContact } from '@/types/contacts';
import type { PressPhoto } from '@/types/press-photos';
import { AboutSection } from './AboutSection';
import { PROFILE_STORY_ARTIST } from './profile-story-fixture';

/**
 * Rendered states of the profile About section. The default stories live in
 * AboutSection.stories.tsx.
 */
const DarkProfileFrame: Decorator = function DarkProfileFrame(Story) {
  return (
    <div className='bg-base p-6'>
      <Story />
    </div>
  );
};

const RtlProfileFrame: Decorator = function RtlProfileFrame(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

const meta = {
  title: 'Profile/AboutSection/States',
  component: AboutSection,
  parameters: { layout: 'fullscreen' },
  args: { artist: PROFILE_STORY_ARTIST },
  decorators: [DarkProfileFrame],
} satisfies Meta<typeof AboutSection>;

export default meta;
type Story = StoryObj<typeof meta>;

const pressPhoto: PressPhoto = {
  id: 'press-1',
  blobUrl: '/images/avatars/tim-white.jpg',
  smallUrl: '/images/avatars/tim-white.jpg',
  mediumUrl: '/images/avatars/tim-white.jpg',
  largeUrl: '/images/avatars/tim-white.jpg',
  originalFilename: 'tim-white-press.jpg',
  width: 1200,
  height: 1500,
  status: 'ready',
  sortOrder: 0,
};

const longContact: PublicContact = {
  id: 'contact-long',
  role: 'bookings',
  roleLabel: 'Worldwide Booking And Festival Partnerships Representation',
  territorySummary: 'North America, Europe, Latin America and Asia Pacific',
  territoryCount: 4,
  channels: [{ type: 'email', encoded: 'bW9va0BleGFtcGxlLmNvbQ==' }],
};

/** Long content: a multi-paragraph bio, long metadata and a long contact. */
export const LongContentBio: Story = {
  args: {
    artist: {
      ...PROFILE_STORY_ARTIST,
      tagline:
        'Producer, songwriter, and after-hours romantic who has spent fifteen years building records in borrowed studios, late-night sessions and tour buses across three continents.\n\nThe new record collects every collaboration from the last two years into one long, unbroken set.',
      location: 'Los Angeles, California, United States of America',
      hometown: 'Saint Petersburg, Florida',
      active_since_year: 2009,
    },
    genres: [
      'progressive house',
      'melodic techno',
      'deep house',
      'indie dance',
    ],
    contacts: [longContact],
  },
};

/**
 * Permission denied: the artist has press photos but has not allowed
 * downloads, so the press photo grid stays hidden.
 */
export const PermissionDeniedPhotoDownloads: Story = {
  args: {
    pressPhotos: [pressPhoto],
    allowPhotoDownloads: false,
  },
};

/** Press photos with downloads allowed, for comparison with the state above. */
export const PartialPressPhotosAllowed: Story = {
  args: {
    pressPhotos: [pressPhoto],
    allowPhotoDownloads: true,
    contacts: [],
  },
};

/** Right-to-left: Arabic bio and location in an Arabic document direction. */
export const RtlArabicBio: Story = {
  args: {
    artist: {
      ...PROFILE_STORY_ARTIST,
      tagline: 'منتج وكاتب أغانٍ يصنع موسيقى الليل المتأخر.',
      location: 'دبي',
    },
    genres: ['هاوس'],
  },
  decorators: [RtlProfileFrame],
};
