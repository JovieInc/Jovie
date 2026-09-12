import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { UnfazedProfileClient } from './UnfazedProfileClient';

const meta: Meta<typeof UnfazedProfileClient> = {
  title: 'Profile/UnfazedProfileClient',
  component: UnfazedProfileClient,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof UnfazedProfileClient>;

export const Default: Story = {};
