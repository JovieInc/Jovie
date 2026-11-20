import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { DspAvatarItem } from './DspAvatarStack';
import { DspAvatarStack } from './DspAvatarStack';

const dsps: DspAvatarItem[] = [
  {
    id: 'spotify',
    status: 'live',
    label: 'Spotify',
    glyph: 'S',
    color: '#1DB954',
  },
  {
    id: 'apple',
    status: 'pending',
    label: 'Apple Music',
    glyph: 'A',
    color: '#FA243C',
  },
  {
    id: 'youtube',
    status: 'error',
    label: 'YouTube Music',
    glyph: 'Y',
    color: '#FF0000',
  },
  {
    id: 'tidal',
    status: 'missing',
    label: 'Tidal',
    glyph: 'T',
    color: '#000000',
  },
];

const meta = {
  title: 'Shell/DspAvatarStack',
  component: DspAvatarStack,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='bg-base p-8'>
        <Story />
      </div>
    ),
  ],
  args: {
    dsps,
  },
} satisfies Meta<typeof DspAvatarStack>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('button', {
      name: 'View DSP Distribution Details +3',
    });
    await expect(trigger).toHaveAccessibleName(
      'View DSP Distribution Details +3'
    );
  },
};

export const KeyboardDetails: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole('button', {
      name: /^View DSP Distribution Details/i,
    });

    await userEvent.click(trigger);
    await expect(
      body.getByRole('dialog', { name: 'DSP Distribution Details' })
    ).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(body.queryByRole('dialog')).not.toBeInTheDocument()
    );
    await expect(trigger).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(
      body.getByRole('dialog', { name: 'DSP Distribution Details' })
    ).toHaveFocus();
    await waitFor(() => {
      expect(
        body.getByRole('dialog', { name: 'DSP Distribution Details' })
      ).toBeVisible();
    });
  },
};

export const MultipleVisible: Story = {
  args: {
    maxVisible: 3,
  },
};

export const AllLive: Story = {
  args: {
    dsps: dsps.map(d => ({ ...d, status: 'live' })),
    maxVisible: 4,
  },
};

export const Empty: Story = {
  args: {
    dsps: [],
  },
};
