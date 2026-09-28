import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AnonCookieBootstrap } from './AnonCookieBootstrap';

const meta: Meta<typeof AnonCookieBootstrap> = {
  title: 'Profile/AnonCookieBootstrap',
  component: AnonCookieBootstrap,
  parameters: {
    layout: 'centered',
  },
};

export default meta;

type Story = StoryObj<typeof AnonCookieBootstrap>;

/**
 * The bootstrap renders nothing visible; it resolves the per-user experiment
 * assignment on mount and reports it through callbacks.
 */
export const Default: Story = {
  args: {},
};
