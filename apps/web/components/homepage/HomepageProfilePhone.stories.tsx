import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HOMEPAGE_FEATURED_ARTIST } from '@/data/demoArtists';
import { HomepageProfilePhone } from './HomepageProfilePhone';

/** The featured (demo) artist's profile at the canonical 310px phone (Pen WyQJb). */
const meta = {
  title: 'Marketing/HomepageProfilePhone',
  component: HomepageProfilePhone,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof HomepageProfilePhone>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FeaturedArtist: Story = {
  args: {
    alt: 'An example artist’s Jovie profile.',
    release: {
      title: HOMEPAGE_FEATURED_ARTIST.releases[0].title,
      src: HOMEPAGE_FEATURED_ARTIST.releases[0].src,
    },
  },
};

/** Long content: a long release title on the featured card. */
export const LongContentReleaseTitle: Story = {
  args: {
    alt: 'An example artist’s Jovie profile.',
    release: {
      title:
        'Midnight Drive (Extended Club Mix) [feat. Maya Vale] · Deluxe Anniversary Edition',
      src: HOMEPAGE_FEATURED_ARTIST.releases[0].src,
    },
  },
};

/** Right-to-left: the phone inside an RTL document with an Arabic title. */
export const RtlArabicRelease: Story = {
  args: {
    alt: 'ملف فنان تجريبي على جوفي.',
    release: {
      title: 'ليالي القاهرة',
      src: HOMEPAGE_FEATURED_ARTIST.releases[0].src,
    },
  },
  render: args => (
    <div dir='rtl' lang='ar'>
      <HomepageProfilePhone {...args} />
    </div>
  ),
};
