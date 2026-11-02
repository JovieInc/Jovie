import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { AgentClaimScreen } from '@/app/claim/agent/[draftId]/AgentClaimScreen';
import type { AgentClaimPreview } from '@/lib/agent-acquisition/draft-claim.server';

/**
 * /claim/agent/[draftId] (JOV-9760): every state a person can reach from an
 * assistant's claim link. `verification_required` and `existing_profile`
 * redirect into the existing /claim/start and /{handle}/claim flows, so they
 * have no screen of their own here.
 */
const draftId = '9efebd98-39b7-4a77-8965-04b5aafad9ad';
const handoff = 'Besf6yDvKw9YeXFyVLdKhGRgi-LjGGtu_CCLOElEqPI';

const preview: AgentClaimPreview = {
  artistName: 'Signal Artist',
  provider: 'spotify',
  sourceUrl: 'https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb',
  imageUrl: null,
  bio: null,
  release: {
    title: 'Signal Fire',
    artistName: 'Signal Artist',
    releaseDate: '2026-11-07',
    artworkUrl: null,
    links: {
      spotify: 'https://open.spotify.com/album/0sNOF9WDwhWunNAHPD3Baj',
      apple_music: 'https://music.apple.com/us/album/signal-fire/1234567890',
    },
  },
  expiresAt: '2026-11-04T12:00:00.000Z',
  digest: 'Wn0aWl0n7d5j2C3TzMvCw2yYk0b2k2n2tQ8o3m3e8xQ',
};

async function submitClaim() {
  // Storybook fixture: the route passes the real server action.
}

const meta = {
  title: 'Pages/Claim/Agent Draft',
  component: AgentClaimScreen,
  parameters: {
    layout: 'fullscreen',
    chromatic: { viewports: [390, 1440] },
  },
  args: {
    draftId,
    handoff,
    view: { state: 'ready', preview },
    signedIn: true,
    error: null,
    claimAction: submitClaim,
  },
} satisfies Meta<typeof AgentClaimScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PreviewSignedIn: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('button', { name: 'Claim This Draft' })
    ).toBeVisible();
    await expect(canvas.getByTestId('agent-claim-links')).toHaveTextContent(
      'https://open.spotify.com/album/0sNOF9WDwhWunNAHPD3Baj'
    );
  },
};

export const PreviewSignedOut: Story = {
  args: { signedIn: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('link', { name: 'Sign Up To Claim' })
    ).toHaveAttribute('href', expect.stringContaining('redirect_url='));
  },
};

export const ClaimedByViewer: Story = {
  args: {
    view: { state: 'claimed', ownedByViewer: true, handle: 'signalartist' },
  },
};

export const AlreadyClaimed: Story = {
  args: { view: { state: 'claimed', ownedByViewer: false, handle: null } },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('link', { name: 'Sign In' })
    ).toBeVisible();
  },
};

export const Expired: Story = {
  args: { view: { state: 'expired' } },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('link', { name: 'Create Your Profile' })
    ).toHaveAttribute('href', '/start');
  },
};

export const InvalidLink: Story = {
  args: { view: { state: 'invalid' } },
};

export const WaitlistPending: Story = {
  args: { error: 'waitlist_pending' },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('link', { name: 'View Waitlist Status' })
    ).toHaveAttribute('href', '/waitlist');
  },
};

export const DraftChanged: Story = {
  args: { error: 'draft_changed' },
};

export const UnsupportedProvider: Story = {
  args: { error: 'unsupported_provider' },
};

export const ArtistTaken: Story = {
  args: { error: 'artist_taken' },
};
