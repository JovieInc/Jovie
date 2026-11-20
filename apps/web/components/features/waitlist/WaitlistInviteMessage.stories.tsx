import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { WaitlistInviteMessage } from './WaitlistInviteMessage';

const meta = {
  title: 'Marketing/Routes/WaitlistInvite',
  component: WaitlistInviteMessage,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Recovery presentations for web-213-waitlist--invite. The /waitlist/invite server route keeps token parsing, authentication, verification, rate limiting, redemption, and redirects; these deterministic stories supply only copy already shipped by the route.',
      },
    },
    backgrounds: { default: 'dark' },
    viewport: { defaultViewport: 'desktop' },
    pen: {
      registryId: 'web-213-waitlist--invite',
      route: '/waitlist/invite',
      source: 'apps/web/components/features/waitlist/WaitlistInviteMessage.tsx',
      sourceExport: 'WaitlistInviteMessage',
      sourceSha: '00895196e53b823bb0311193b4af29f67b8849c1',
      storyExport: 'Web213MissingToken',
      fixture: 'missing token',
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof WaitlistInviteMessage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Web213MissingToken: Story = {
  name: 'web-213 /waitlist/invite — missing token',
  args: {
    title: 'Invite link missing',
    body: 'This invite link is missing its secure token. Open the latest invite email and try again.',
  },
};

export const Web213UnverifiedEmail: Story = {
  name: 'web-213 /waitlist/invite — unverified email',
  parameters: {
    pen: {
      storyExport: 'Web213UnverifiedEmail',
      fixture: 'unverified email',
    },
  },
  args: {
    title: 'Verify your email',
    body: 'Sign in with the same verified email address that received this invite, then open the link again.',
  },
};
