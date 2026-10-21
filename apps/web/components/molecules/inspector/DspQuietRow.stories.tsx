import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ProviderIcon } from '@/components/atoms/ProviderIcon';
import { DspQuietRow } from './DspQuietRow';

const meta = {
  title: 'Molecules/Inspector/DspQuietRow',
  decorators: [
    Story => (
      <div className='w-80 max-w-full'>
        <Story />
      </div>
    ),
  ],
  component: DspQuietRow,
  parameters: {
    layout: 'centered',
    chromatic: { viewports: [390, 1024] },
    jovie: { uncoveredProps: ['closedTabIndex', 'testId'] },
  },
  args: {
    label: 'Spotify',
    href: 'https://open.spotify.com/album/example',
    icon: <ProviderIcon provider='spotify' aria-hidden='true' />,
    onFind: fn(),
    findLabel: 'Find',
  },
} satisfies Meta<typeof DspQuietRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LinkedRow: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: 'Spotify' })).toHaveAttribute(
      'href',
      args.href
    );
    await expect(
      canvas.queryByRole('button', { name: 'Find' })
    ).not.toBeInTheDocument();
  },
};

export const MissingWithFind: Story = {
  args: { href: null },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('link')).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Find' }));
    await expect(args.onFind).toHaveBeenCalledOnce();
  },
};

export const MissingReadOnly: Story = {
  args: { href: null, onFind: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Spotify')).toBeVisible();
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
    await expect(canvas.queryByRole('link')).not.toBeInTheDocument();
  },
};
