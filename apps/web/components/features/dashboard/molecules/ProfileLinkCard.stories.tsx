import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProfileLinkCard } from './ProfileLinkCard';

const meta = {
  title: 'Dashboard/Molecules/ProfileLinkCard',
  component: ProfileLinkCard,
  parameters: {
    layout: 'padded',
  },
  args: {
    handle: 'tim',
  },
} satisfies Meta<typeof ProfileLinkCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const LongHandle: Story = {
  args: {
    handle: 'sasha-waves-official',
  },
};
