import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { GoogleOneTap } from './GoogleOneTap';

const meta = {
  title: 'Features/Auth/GoogleOneTap',
  component: GoogleOneTap,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Renders nothing. On mount it asks Google Identity Services for the One Tap prompt when a client id is configured, outside native webviews, automation, and managed browser audits.',
      },
    },
  },
  args: {
    mode: 'sign-in',
    suppress: false,
  },
} satisfies Meta<typeof GoogleOneTap>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignIn: Story = {};

export const Suppressed: Story = {
  args: { suppress: true },
};
