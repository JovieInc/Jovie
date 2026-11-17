import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HOMEPAGE_EDITORIAL_COPY } from '@/data/homepageEditorialCopy';
import {
  HomepageInviteClose,
  HomepageProfileChapter,
  HomepageReleasesChapter,
  HomepageStoryHero,
} from './HomepageEditorial';

/**
 * The editorial homepage (Tim, 2026-11-03): the locked line, the jov.ie/you
 * profile, the releases workspace, then the claim-your-profile close.
 */
const meta = {
  title: 'Marketing/HomepageEditorial',
  component: HomepageStoryHero,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Homepage chapters. The hero, header and close enter /start to claim a profile (the invitation form returns only while public signup is closed); product imagery comes from the screenshot registry.',
      },
    },
  },
} satisfies Meta<typeof HomepageStoryHero>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Hero: Story = {};

export const Profile: Story = {
  render: () => <HomepageProfileChapter />,
};

export const Releases: Story = {
  render: () => <HomepageReleasesChapter />,
};

export const InviteClose: Story = {
  render: () => <HomepageInviteClose />,
};

/**
 * Long content: a published headline with no reviewed line breaks wraps
 * naturally, beside a body twice the approved length.
 */
export const LongContentProfileCopy: Story = {
  render: () => (
    <HomepageProfileChapter
      copy={{
        headline:
          'One name that every listener, promoter, label and playlist editor finds the same way, everywhere.',
        body: 'Your profile at jov.ie leads with what matters now: your latest release, your links, the shows you have coming up and a way for listeners to get updates. Every service, every release and every update stays in one place under the one name people already search for.',
      }}
    />
  ),
};

/** Right-to-left: translated hero lede and profile chapter in an Arabic document. */
export const RtlArabic: Story = {
  render: () => (
    <div dir='rtl' lang='ar'>
      <HomepageStoryHero
        headingId='home-hero-heading-rtl'
        copy={{
          ...HOMEPAGE_EDITORIAL_COPY.hero,
          subhead: 'ملفك، وكل إصدار، ورابط لكل منصة تُبث عليها موسيقاك.',
        }}
      />
      <HomepageProfileChapter
        copy={{
          headline: 'اسم واحد. في كل مكان.',
          body: 'ملفك على jov.ie يبدأ بما يهم الآن: أحدث إصدار، وروابطك، وطريقة ليتابعك المستمعون.',
        }}
      />
    </div>
  ),
};
