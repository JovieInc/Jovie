import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ArtistName } from './ArtistName';

const meta = {
  title: 'Atoms/ArtistName',
  component: ArtistName,
  parameters: {
    layout: 'centered',
  },
  args: {
    name: 'Taylor Swift',
    handle: 'taylorswift',
  },
} satisfies Meta<typeof ArtistName>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Verified: Story = {
  args: {
    isVerified: true,
  },
};

export const Small: Story = {
  args: {
    size: 'sm',
    isVerified: true,
  },
};

export const ExtraLarge: Story = {
  args: {
    size: 'xl',
    isVerified: true,
  },
};

export const NoLink: Story = {
  args: {
    isVerified: true,
    showLink: false,
  },
};

export const InlineSpan: Story = {
  name: 'Inline (as=span)',
  args: {
    as: 'span',
    isVerified: true,
    showLink: false,
    size: 'sm',
  },
  render: args => (
    <p className='text-app text-secondary-token'>
      Now playing on <ArtistName {...args} />
    </p>
  ),
};
