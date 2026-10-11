import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AudienceUserCell } from './AudienceUserCell';

const meta = {
  title: 'Organisms/Table/Atoms/AudienceUserCell',
  component: AudienceUserCell,
  parameters: {
    layout: 'centered',
  },
  args: {
    displayName: 'Jamie Rivera',
    type: 'email',
  },
} satisfies Meta<typeof AudienceUserCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithTypeDot: Story = {
  args: {
    showTypeDot: true,
  },
};

export const Anonymous: Story = {
  args: {
    displayName: null,
    type: 'anonymous',
    deviceType: 'mobile',
    geoCity: 'Austin',
  },
};

export const Bot: Story = {
  args: {
    displayName: 'Crawler',
    type: 'anonymous',
    tags: ['bot'],
  },
};
