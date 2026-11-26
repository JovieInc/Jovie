import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ReleaseCreditsDialog } from './ReleaseCreditsDialog';

const meta = {
  title: 'Release/ReleaseCreditsDialog',
  component: ReleaseCreditsDialog,
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: {
    credits: [
      {
        role: 'producer',
        label: 'Producer',
        entries: [
          {
            artistId: 'ada',
            name: 'Ada Lovelace',
            handle: 'ada',
            role: 'producer',
            position: 1,
          },
        ],
      },
    ],
  },
} satisfies Meta<typeof ReleaseCreditsDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: { credits: [] },
};
