import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { fn } from 'storybook/test';
import { EntityThreadGlyph } from './EntityThreadGlyph';

/** Rendered states of the entity thread glyph beyond the default stories. */
const meta = {
  title: 'Shell/EntityThreadGlyph/States',
  component: EntityThreadGlyph,
  parameters: { layout: 'centered' },
  args: {
    threadTitle: 'Update release copy for Midnight Static',
    onOpen: fn(),
  },
} satisfies Meta<typeof EntityThreadGlyph>;

export default meta;
type Story = StoryObj<typeof meta>;

function RtlFrame({ children }: Readonly<{ children: ReactNode }>) {
  return <div dir='rtl'>{children}</div>;
}

function withRtlFrame(StoryFn: () => ReactNode) {
  return <RtlFrame>{StoryFn()}</RtlFrame>;
}

/** Empty: a thread with no title still exposes the labelled button. */
export const EmptyThreadTitle: Story = { args: { threadTitle: '' } };

/** Long content: a long title only feeds the screen-reader text. */
export const LongContentThreadTitle: Story = {
  args: {
    threadTitle:
      'Generate the lyric video, update the release copy and pitch it to every playlist curator on the list',
  },
};

/** Rtl: the glyph in a right-to-left row. */
export const RtlGlyph: Story = { decorators: [withRtlFrame] };
