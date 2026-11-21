import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { CuesPanel } from './CuesPanel';
import type { Cue } from './cues.types';

const cues: Cue[] = [
  { at: 0, kind: 'intro', label: 'Intro' },
  { at: 45, kind: 'chorus', label: 'Chorus' },
];

function Frame(Story: () => ReactNode) {
  return (
    <div className='w-80 bg-base'>
      <Story />
    </div>
  );
}

function RtlFrame(Story: () => ReactNode) {
  return (
    <div dir='rtl' className='w-80 bg-base'>
      <Story />
    </div>
  );
}

/**
 * State coverage for the cues panel. The canonical stories stay in
 * CuesPanel.stories.tsx; these show a read-only list, long labels and the
 * document direction.
 */
const meta = {
  title: 'Shell/CuesPanel States',
  component: CuesPanel,
  parameters: { layout: 'centered' },
  decorators: [Frame],
  args: { cues, durationSec: 214 },
} satisfies Meta<typeof CuesPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: no seek handler, so rows render disabled. */
export const PartialReadOnly: Story = {};

/** Long content: long cue labels truncate inside the row. */
export const LongContentLabels: Story = {
  args: {
    cues: [
      {
        at: 12,
        kind: 'verse',
        label: 'Verse 1 with an extremely long working title for the section',
      },
      { at: 90, kind: 'drop', label: 'Drop (extended festival edit)' },
    ],
  },
};

/** Rtl: the list follows the document direction. */
export const RtlDirection: Story = { decorators: [RtlFrame] };
