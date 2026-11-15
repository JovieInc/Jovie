import { TooltipProvider } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { SpotifyAccountIdentity } from './SpotifyAccountIdentity';

/** State coverage for the Spotify identity pill; the label precedence lives in SpotifyAccountIdentity.stories.tsx. */
const meta = {
  title: 'Features/Admin/SpotifyAccountIdentity States',
  component: SpotifyAccountIdentity,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <TooltipProvider>
        <div className='max-w-xs'>
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof SpotifyAccountIdentity>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no name, handle or id yet, so the pill falls back to a generic label. */
export const EmptyNoIdentity: Story = {
  args: { displayName: null, handle: null, accountId: null },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByTestId('spotify-account-identity')
    ).toHaveTextContent('Spotify account');
  },
};

/** Partial: only a handle is known; there is no link to open. */
export const PartialHandleOnly: Story = {
  args: { handle: 'jovieartist' },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByTestId('spotify-account-identity')
    ).toHaveTextContent('@jovieartist');
  },
};

const LONG_NAME =
  'The Extraordinarily Long Named Orchestra and Friends Featuring Everyone';

/** Long content: a long display name stays inside the pill. */
export const LongContentDisplayName: Story = {
  args: {
    displayName: LONG_NAME,
    href: 'https://open.spotify.com/artist/1',
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByTestId('spotify-account-identity')
    ).toHaveTextContent(LONG_NAME);
  },
};

/** Right-to-left: an Arabic display name inside an RTL document. */
export const RtlArabic: Story = {
  args: { displayName: 'فنان جوفي', href: 'https://open.spotify.com/artist/1' },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByTestId('spotify-account-identity')
    ).toHaveTextContent('فنان جوفي');
  },
};
