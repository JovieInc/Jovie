import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ArtistProfileSectionHeader } from './ArtistProfileSectionHeader';

const meta = {
  title: 'Marketing/Artist Profile/ArtistProfileSectionHeader',
  component: ArtistProfileSectionHeader,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    Story => (
      <div className='bg-base px-6 py-16 text-primary-token'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ArtistProfileSectionHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Centered: Story = {
  args: {
    eyebrow: 'Artist Profile',
    headline: 'Own the fan path from first tap.',
    body: 'A profile surface that routes every visitor to the next useful action.',
  },
};

export const LeftAligned: Story = {
  args: {
    ...Centered.args,
    align: 'left',
  },
};
