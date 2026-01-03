import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProfileLinkCard } from './ProfileLinkCard';

const meta: Meta<typeof ProfileLinkCard> = {
  title: 'Dashboard/Molecules/ProfileLinkCard',
  component: ProfileLinkCard,
  parameters: {
    layout: 'padded',
  },
  args: {
    handle: 'example-handle',
  },
  argTypes: {
    handle: { control: 'text' },
  },
};

export default meta;

type Story = StoryObj<typeof ProfileLinkCard>;

export const Default: Story = {};

export const LongHandle: Story = {
  args: {
    handle: 'this-is-a-much-longer-handle',
  },
};
