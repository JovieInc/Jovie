import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AudienceTypeBadge } from './AudienceTypeBadge';

const meta = {
  title: 'Organisms/Table/Atoms/AudienceTypeBadge',
  component: AudienceTypeBadge,
  parameters: {
    layout: 'centered',
  },
  args: {
    type: 'email',
  },
} satisfies Meta<typeof AudienceTypeBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Email: Story = {};

export const Spotify: Story = {
  args: {
    type: 'spotify',
  },
};

export const Customer: Story = {
  args: {
    type: 'customer',
  },
};

export const Anonymous: Story = {
  args: {
    type: 'anonymous',
  },
};
