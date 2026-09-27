import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AudienceIdentificationIndicator } from './AudienceIdentificationIndicator';

const meta = {
  title: 'Organisms/Table/AudienceIdentificationIndicator',
  component: AudienceIdentificationIndicator,
  parameters: {
    layout: 'centered',
  },
  args: {
    type: 'customer',
    hasEmail: true,
    hasPhone: false,
    spotifyConnected: false,
  },
} satisfies Meta<typeof AudienceIdentificationIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Identified: Story = {};

export const Partial: Story = {
  args: {
    type: 'sms',
    hasEmail: false,
    hasPhone: true,
    spotifyConnected: false,
  },
};

export const Anonymous: Story = {
  args: {
    type: 'anonymous',
    hasEmail: false,
    hasPhone: false,
    spotifyConnected: false,
  },
};
