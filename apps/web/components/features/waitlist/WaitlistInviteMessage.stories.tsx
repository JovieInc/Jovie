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
          'Exact missing-token presentation for web-213-waitlist--invite. The /waitlist/invite server route keeps token parsing, authentication, rate limiting, redemption, and redirects; this deterministic story supplies only copy already shipped by the route.',
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
