import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { LibraryShareDropCreator } from './LibraryShareDropCreator';

/**
 * Stories for the Library right-rail share card (JOV-3120).
 *
 * Covers the three rail share states:
 *  - Empty: the collapsed "Share drop" trigger.
 *  - Panel: the expanded create form.
 *  - Created: the result card showing the URL with Copy + Open buttons.
 *
 * `fetch` is stubbed so the created state can be reached deterministically in
 * Chromatic/Vitest without hitting the network.
 */
const meta: Meta<typeof LibraryShareDropCreator> = {
  title: 'Features/LibraryShare/ShareDropCreator',
  component: LibraryShareDropCreator,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-72 bg-surface-1 p-3'>
        <Story />
      </div>
    ),
  ],
  args: {
    releaseIds: ['release-1'],
    candidateAssets: [
      { id: 'release-1', title: 'Midnight Drive' },
      { id: 'release-2', title: 'Sunrise Loop' },
    ],
    defaultTitle: 'Midnight Drive press kit',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const SHARE_URL = 'https://jov.ie/s/midnight-drive-press-kit';

function stubShareFetch() {
  globalThis.fetch = (() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ shareUrl: SHARE_URL }),
    })) as unknown as typeof fetch;
}

/** Collapsed trigger — the rail's resting state. */
export const Empty: Story = {};

/** Expanded create form. */
export const Panel: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByTestId('library-share-create-trigger'));
    await expect(
      canvas.getByTestId('library-share-create-panel')
    ).toBeInTheDocument();
  },
};

/** Result card with the share URL, Copy, and Open buttons. */
export const Created: Story = {
  play: async ({ canvasElement }) => {
    stubShareFetch();
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByTestId('library-share-create-trigger'));
    await userEvent.click(canvas.getByText('Create link'));

    await waitFor(() =>
      expect(
        canvas.getByTestId('library-share-created-panel')
      ).toBeInTheDocument()
    );

    // URL is shown inline, Copy + Open buttons are present.
    await expect(
      canvas.getByTestId('library-share-created-url')
    ).toHaveTextContent(SHARE_URL);
    await expect(
      canvas.getByTestId('library-share-copy-button')
    ).toBeInTheDocument();

    const openLink = canvas.getByTestId('library-share-open-button');
    await expect(openLink).toHaveAttribute('href', SHARE_URL);
    await expect(openLink).toHaveAttribute('target', '_blank');
  },
};
