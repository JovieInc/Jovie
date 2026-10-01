import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ReleaseFields } from './ReleaseFields';

const meta = {
  title: 'Organisms/ReleaseSidebar/ReleaseFields',
  component: ReleaseFields,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-72'>
        <Story />
      </div>
    ),
  ],
  args: {
    releaseDate: '2026-11-14',
    releaseType: 'single',
    totalTracks: 1,
    platformCount: 6,
  },
} satisfies Meta<typeof ReleaseFields>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NoReleaseDate: Story = {
  args: {
    releaseDate: undefined,
  },
};

export const WithRevealDate: Story = {
  args: {
    revealDate: '2026-11-01',
  },
};

export const Album: Story = {
  args: {
    releaseType: 'album',
    totalTracks: 12,
  },
};
