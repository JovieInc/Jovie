import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { EntityHoverLink } from './EntityPopover';

function Frame(Story: () => ReactNode) {
  return (
    <div className='flex min-h-72 w-full max-w-xl items-center justify-center'>
      <Story />
    </div>
  );
}

function RtlFrame(Story: () => ReactNode) {
  return (
    <div
      dir='rtl'
      className='flex min-h-72 w-full max-w-xl items-center justify-center'
    >
      <Story />
    </div>
  );
}

/**
 * State coverage for the entity popover, opened from its hover link. The
 * canonical story stays in EntityPopover.stories.tsx; these show a sparse
 * entity, long metadata and the document direction.
 */
const meta = {
  title: 'Shell/EntityPopover States',
  component: EntityHoverLink,
  parameters: { layout: 'centered' },
  decorators: [Frame],
  play: async ({ canvasElement }) => {
    await userEvent.hover(
      within(canvasElement).getByRole('button', { name: /Night Drive/ })
    );
    await waitFor(() =>
      expect(
        within(canvasElement.ownerDocument.body).getByRole('tooltip')
      ).toBeVisible()
    );
  },
} satisfies Meta<typeof EntityHoverLink>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: a release with only an id and a label. */
export const PartialRelease: Story = {
  args: {
    entity: { kind: 'release', id: 'partial', label: 'Night Drive' },
    children: 'Night Drive',
  },
};

/** Long content: long title and artist wrap inside the card. */
export const LongContentRelease: Story = {
  args: {
    entity: {
      kind: 'release',
      id: 'long',
      label: 'Night Drive (The Extended Anniversary Edition Remastered)',
      artist: 'An Artist With A Particularly Long Stage Name And Collective',
      releaseType: 'Album',
      totalTracks: 24,
      durationSec: 5400,
    },
    children: 'Night Drive',
  },
};

/** Rtl: the card follows the document direction. */
export const RtlDirection: Story = {
  decorators: [RtlFrame],
  args: {
    entity: {
      kind: 'release',
      id: 'rtl',
      label: 'Night Drive',
      artist: 'Jovie',
    },
    children: 'Night Drive',
  },
};
