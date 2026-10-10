import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { EntityPopover, type EntityPopoverData } from './EntityPopover';

const partialRelease: EntityPopoverData = {
  kind: 'release',
  id: 'refresh-fixture',
  label: 'Night Drive',
};
const loadedRelease: EntityPopoverData = {
  ...partialRelease,
  artist: 'Jovie',
  releaseType: 'Album',
  totalTracks: 12,
  durationSec: 3680,
  releaseDate: '2026-10-01',
  status: 'Ready for release',
};

function RefreshScene() {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      <div style={{ position: 'fixed', bottom: 48, left: 32 }}>
        <Button
          ref={setAnchor}
          variant='secondary'
          onClick={() => setLoaded(value => !value)}
        >
          Refresh release details
        </Button>
      </div>
      {anchor && (
        <EntityPopover
          anchor={anchor}
          entity={loaded ? loadedRelease : partialRelease}
        />
      )}
    </>
  );
}

const meta = {
  title: 'Shell/EntityPopover',
  component: RefreshScene,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof RefreshScene>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ContentRefresh: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const trigger = body.getByRole('button', {
      name: 'Refresh release details',
    });
    await waitFor(() => expect(body.getByRole('tooltip')).toBeVisible());
    // Keyboard refresh isolates content reflow from compact pointer overlap.
    trigger.focus();
    await userEvent.keyboard('[Space]');
    await waitFor(() => {
      const card = body.getByRole('tooltip');
      expect(card).toHaveTextContent('Ready for release');
      expect(card.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        window.innerHeight
      );
      expect(trigger).toHaveFocus();
    });
  },
};
