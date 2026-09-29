import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { SmartLinkCreditGroup } from '@/app/[username]/[slug]/_lib/data';
import { ReleaseCreditsSection } from './ReleaseCreditsSection';

const creditGroups: SmartLinkCreditGroup[] = [
  {
    role: 'producer',
    label: 'Producer',
    entries: [
      {
        artistId: 'artist-1',
        name: 'Jane Producer',
        handle: 'janeproducer',
        role: 'producer',
        position: 0,
      },
    ],
  },
  {
    role: 'composer',
    label: 'Composer',
    entries: [
      {
        artistId: 'artist-2',
        name: 'Alex Writer',
        handle: null,
        role: 'composer',
        position: 0,
      },
    ],
  },
];

const meta = {
  title: 'Organisms/ReleaseSidebar/ReleaseCreditsSection',
  component: ReleaseCreditsSection,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='w-80'>
        <Story />
      </div>
    ),
  ],
  args: {
    releaseId: 'rel-1',
    creditsGroups: creditGroups,
  },
} satisfies Meta<typeof ReleaseCreditsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Flat: Story = {
  args: { variant: 'flat' },
};
