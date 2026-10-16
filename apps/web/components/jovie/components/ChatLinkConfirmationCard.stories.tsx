import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  dismissProposal,
  undismissProposal,
} from '@/lib/chat/proposal-dismiss-ledger';
import { ChatLinkConfirmationCard } from './ChatLinkConfirmationCard';

const meta = {
  title: 'Jovie/Components/ChatLinkConfirmationCard',
  component: ChatLinkConfirmationCard,
  parameters: { layout: 'padded' },
  args: {
    profileId: '00000000-0000-4000-8000-000000000001',
    toolCallId: 'adaptive-link-1',
    platform: {
      id: 'spotify',
      name: 'Spotify',
      icon: 'spotify',
      color: 'brand-spotify',
    },
    normalizedUrl: 'https://open.spotify.com/artist/example',
    originalUrl: 'https://open.spotify.com/artist/example',
  },
  decorators: [
    Story => (
      <main className='mx-auto w-full max-w-lg space-y-4'>
        <Story />
        <label className='block text-sm text-primary-token'>
          Unsent notes
          <textarea
            aria-label='Unsent notes'
            defaultValue='Keep this draft'
            className='block w-full border border-subtle bg-surface-1'
          />
        </label>
      </main>
    ),
  ],
} satisfies Meta<typeof ChatLinkConfirmationCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Browser tests supply only the existing API adapter; the card/hook are real. */
export const Confirmation: Story = {};
export const Dismissed: Story = {
  args: { toolCallId: 'story-tool-call-dismissed' },
  beforeEach: () => {
    const key =
      '00000000-0000-4000-8000-000000000001:story-tool-call-dismissed';
    dismissProposal(key);
    return () => undismissProposal(key);
  },
};
export const Pending: Story = { args: { preview: true } };
export const Preview: Story = { args: { preview: true } };
