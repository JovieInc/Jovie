import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
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

/**
 * Add posts to /api/chat/confirm-link. These stories answer that one route
 * from a fixture so pressing Add never leaves the browser.
 */
function stubConfirmLinkRoute(respond: () => Promise<Response>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    if (String(input).includes('/api/chat/confirm-link')) return respond();
    throw new Error('Unexpected network request in link confirmation story.');
  };
  return () => {
    globalThis.fetch = originalFetch;
  };
}

async function pressAddAndExpect(canvasElement: HTMLElement, status: string) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('button', { name: 'Add' }));
  const output = canvas.getByRole('status', { name: 'Link Confirmation' });
  await waitFor(() => expect(output).toHaveTextContent(status));
}

/** The server rejected the link (4xx): nothing was saved, so Add stays available. */
export const ErrorSaveRejected: Story = {
  args: { toolCallId: 'story-tool-call-rejected' },
  beforeEach: () =>
    stubConfirmLinkRoute(
      async () =>
        new Response(JSON.stringify({ error: 'Invalid link' }), {
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        })
    ),
  play: ({ canvasElement }) =>
    pressAddAndExpect(canvasElement, 'Unable to add link. Try again.'),
};

/** The request never reached the server: the save is unconfirmed, not failed. */
export const OfflineSaveUnconfirmed: Story = {
  args: { toolCallId: 'story-tool-call-offline' },
  beforeEach: () =>
    stubConfirmLinkRoute(async () => {
      throw new TypeError('Failed to fetch');
    }),
  play: ({ canvasElement }) =>
    pressAddAndExpect(canvasElement, 'Save unconfirmed. Use Check save.'),
};

/** No tool call id and an icon the card does not know: generic link glyph, no ledger. */
export const PartialUnknownPlatform: Story = {
  args: {
    toolCallId: undefined,
    preview: true,
    platform: {
      id: 'linktree',
      name: 'Linktree',
      icon: 'linktree',
      color: 'brand-linktree',
    },
    normalizedUrl: 'https://linktr.ee/example',
    originalUrl: 'linktr.ee/example',
  },
};

/** A long URL truncates with its full value in the title; the actions never wrap away. */
export const LongContent: Story = {
  args: {
    toolCallId: 'story-tool-call-long',
    preview: true,
    platform: {
      id: 'youtubemusic',
      name: 'YouTube Music (Official Artist Channel)',
      icon: 'youtubemusic',
      color: 'brand-youtube',
    },
    normalizedUrl:
      'https://music.youtube.com/channel/UCabcdefghijklmnopqrstuvwxyz0123456789?si=extended-share-token',
    originalUrl:
      'https://music.youtube.com/channel/UCabcdefghijklmnopqrstuvwxyz0123456789?si=extended-share-token',
  },
};

export const RtlConfirmation: Story = {
  args: { toolCallId: 'story-tool-call-rtl', preview: true },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
