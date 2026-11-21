import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useRef } from 'react';
import { DspServiceIcon } from '@/components/atoms/DspLogo';
import type { ActionDialOption } from './ActionDial';
import {
  ActionDialIconTrack,
  ActionDialSelectionCue,
} from './ActionDialChrome';

const windowed: readonly (readonly [number, ActionDialOption])[] = [
  [
    0,
    {
      id: 'spotify',
      label: 'Spotify',
      icon: <DspServiceIcon provider='spotify' />,
    },
  ],
  [
    1,
    {
      id: 'apple_music',
      label: 'Apple Music',
      icon: <DspServiceIcon provider='apple_music' />,
    },
  ],
  [
    2,
    {
      id: 'deezer',
      label: 'Deezer',
      icon: <DspServiceIcon provider='deezer' />,
    },
  ],
];

function IconTrackDemo() {
  const iconRefs = useRef(new Map<number, HTMLElement>());
  return (
    <div className='flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-2'>
      <ActionDialIconTrack
        windowed={windowed}
        activeIndex={0}
        position={0}
        iconRefs={iconRefs}
      />
    </div>
  );
}

function SelectionCueDemo(
  args: React.ComponentProps<typeof ActionDialSelectionCue>
) {
  const hintGlyphRef = useRef<HTMLSpanElement | null>(null);
  return (
    <div className='w-72 rounded-3xl bg-surface-2 p-4'>
      <ActionDialSelectionCue {...args} hintGlyphRef={hintGlyphRef} />
    </div>
  );
}

const meta = {
  title: 'Release/ActionDialChrome',
  component: ActionDialSelectionCue,
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: {
    label: 'Spotify',
    isPreferred: false,
    showHint: false,
    multi: true,
    hintId: 'dial-hint',
    hint: 'Swipe to switch. Your choice is remembered.',
    hintGlyphRef: { current: null },
  },
  render: args => <SelectionCueDemo {...args} />,
} satisfies Meta<typeof ActionDialSelectionCue>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SelectionLabel: Story = {};

export const RememberedCue: Story = {
  args: { isPreferred: true, label: 'Spotify' },
};

export const HintVisible: Story = {
  args: { showHint: true },
};

/** Single-option dial has no swipe hint — caption only. */
export const EmptyNoSwipeHint: Story = {
  args: { multi: false, hint: null, isPreferred: false, label: 'Spotify' },
};

export const IconTrack: Story = {
  render: () => <IconTrackDemo />,
};
