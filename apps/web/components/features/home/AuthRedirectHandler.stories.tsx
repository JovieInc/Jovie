import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AuthRedirectHandler } from './AuthRedirectHandler';

const meta = {
  title: 'Home/AuthRedirectHandler',
  component: AuthRedirectHandler,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Client-side Better Auth session probe. Storybook has no session cookie, so the handler renders nothing.',
      },
    },
  },
} satisfies Meta<typeof AuthRedirectHandler>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Anonymous: Story = {};
