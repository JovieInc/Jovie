import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { fn } from 'storybook/test';
import { ActionDial, type ActionDialOption } from './ActionDial';

const services: ActionDialOption[] = [
  { id: 'spotify', label: 'Spotify', href: 'https://open.spotify.com' },
  {
    id: 'apple_music',
    label: 'Apple Music',
    href: 'https://music.apple.com',
  },
  { id: 'deezer', label: 'Deezer', href: 'https://www.deezer.com' },
];

function InteractiveDial(args: React.ComponentProps<typeof ActionDial>) {
  const [selectedId, setSelectedId] = useState(args.selectedId);
  return (
    <div className='w-80 rounded-3xl bg-surface-2 p-4'>
      <ActionDial
        {...args}
        selectedId={selectedId}
        onSelect={id => {
          setSelectedId(id);
          args.onSelect(id);
        }}
      />
    </div>
  );
}

const meta = {
  title: 'Release/ActionDial',
  component: ActionDial,
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: {
    options: services,
    selectedId: 'spotify',
    onSelect: fn(),
    onActivate: fn(),
    actionLabel: 'Stream Now',
    groupLabel: 'Choose a streaming service',
    hint: 'Swipe to switch. Your choice is remembered.',
  },
  render: args => <InteractiveDial {...args} />,
} satisfies Meta<typeof ActionDial>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SpotifySelected: Story = {};

export const AppleSelected: Story = {
  args: { selectedId: 'apple_music' },
};

export const OneService: Story = {
  args: { options: services.slice(0, 1) },
};

export const DisabledAction: Story = {
  args: { disabled: true },
};
