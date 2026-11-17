import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ProviderIcon } from '@/components/atoms/ProviderIcon';
import { DspEntityRow } from './DspEntityRow';

const meta = {
  title: 'Molecules/Inspector/DspEntityRow',
  decorators: [
    Story => (
      <div className='w-80 max-w-full'>
        <Story />
      </div>
    ),
  ],
  component: DspEntityRow,
  parameters: {
    layout: 'centered',
    chromatic: { viewports: [390, 1024] },
    jovie: { uncoveredProps: ['closedTabIndex', 'testId'] },
    // docs: destination rows preview on hover (left) and carry the
    // Open / Copy link / Copy Jovie link / Copy platform URI menu.
  },
  args: {
    label: 'Spotify',
    href: 'https://open.spotify.com/album/example',
    icon: <ProviderIcon provider='spotify' aria-hidden='true' />,
    onFind: fn(),
    findLabel: 'Find',
  },
} satisfies Meta<typeof DspEntityRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DestinationWithMenuAndPreview: Story = {
  args: {
    jovieLinkUrl:
      'https://jov.ie/example/midnight-drive?utm_source=spotify&utm_medium=work-inspector',
    entity: {
      kind: 'release',
      id: 'midnight-drive',
      label: 'Midnight Drive',
      artist: 'Example Artist',
      releaseType: 'single',
      releaseDate: '2026-10-02T00:00:00.000Z',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.tab();
    await expect(
      canvas.getByRole('button', { name: 'Destination actions for Spotify' })
    ).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Spotify' })).toHaveAttribute(
      'href',
      'https://open.spotify.com/album/example'
    );
  },
};
