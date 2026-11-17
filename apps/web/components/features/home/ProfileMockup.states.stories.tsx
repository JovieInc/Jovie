import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProfileMockup } from './ProfileMockup';
import {
  formatCatalogRelease,
  HOMEPAGE_PROFILE_PREVIEW_CATALOG,
} from './tim-white-catalog';

const catalog = HOMEPAGE_PROFILE_PREVIEW_CATALOG.map(formatCatalogRelease);
const lead = catalog[0]!;

const meta = {
  title: 'Features/Home/ProfileMockup States',
  component: ProfileMockup,
  decorators: [
    function MetaDecorator(Story) {
      return (
        <div className='w-md max-w-full'>
          <Story />
        </div>
      );
    },
  ],
  parameters: { layout: 'centered' },
  args: {
    name: 'Tim White',
    handle: 'tim',
    avatarUrl: '/images/avatars/tim-white.jpg',
  },
} satisfies Meta<typeof ProfileMockup>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a profile with no releases yet. */
export const EmptyReleases: Story = {
  args: { releases: [] },
};

/** Partial: no name, tagline, handle or avatar, so the fallbacks show. */
export const PartialProfile: Story = {
  args: { name: null, tagline: null, handle: null, avatarUrl: null },
};

/** Long content: a long name, tagline and release title. */
export const LongContent: Story = {
  args: {
    name: 'Tim White and the Late Night Los Angeles Orchestra',
    tagline:
      'Indie / Alternative / Electronic / Ambient · Los Angeles, New York and everywhere the tour goes next',
    handle: 'timwhiteandthelatenightlosangelesorchestra',
    releases: [
      {
        ...lead,
        title:
          'Take Me Over (Extended Sunrise Mix featuring the Whole Band, Live from the Rooftop)',
      },
      ...catalog.slice(1),
    ],
  },
};

/** Rtl: an Arabic profile in a right-to-left document. */
export const Rtl: Story = {
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
  args: {
    name: 'تيم وايت',
    tagline: 'موسيقى بديلة · لوس أنجلوس',
    avatarUrl: null,
  },
};
