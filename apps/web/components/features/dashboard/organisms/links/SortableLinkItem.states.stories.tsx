import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { DetectedLink } from '@/lib/utils/platform-detection/types';
import { SortableLinkItem } from './SortableLinkItem';

const link: DetectedLink = {
  platform: {
    id: 'spotify',
    name: 'Spotify',
    category: 'dsp',
    icon: 'spotify',
    color: '#1ED760',
    placeholder: 'https://open.spotify.com/artist/...',
  },
  normalizedUrl: 'https://open.spotify.com/artist/sasha-waves',
  originalUrl: 'https://open.spotify.com/artist/sasha-waves',
  suggestedTitle: 'Spotify',
  isValid: true,
};

function SortableFrame({ children }: { readonly children: React.ReactNode }) {
  return (
    <DndContext>
      <SortableContext items={['link-1']}>
        <div className='w-full max-w-sm'>{children}</div>
      </SortableContext>
    </DndContext>
  );
}

const meta = {
  title: 'Dashboard/Organisms/Links/SortableLinkItem/States',
  component: SortableLinkItem,
  parameters: { layout: 'centered' },
  decorators: [
    function FrameDecorator(Story) {
      return (
        <SortableFrame>
          <Story />
        </SortableFrame>
      );
    },
  ],
  args: {
    id: 'link-1',
    link,
    index: 0,
    onToggle: fn(),
    onRemove: fn(),
    onEdit: fn(),
    visible: true,
    openMenuId: null,
    onAnyMenuOpen: fn(),
    isLastAdded: false,
    buildPillLabel: (item: DetectedLink) => item.suggestedTitle,
  },
} satisfies Meta<typeof SortableLinkItem>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Error: a link that failed validation. */
export const ErrorInvalidLink: Story = {
  args: { link: { ...link, isValid: false } },
};

/** Partial: a hidden link without a drag handle. */
export const PartialHiddenNoHandle: Story = {
  args: { visible: false, draggable: false },
};

/** Long content: a title past the pill width. */
export const LongContent: Story = {
  args: {
    buildPillLabel: () =>
      'An extraordinarily long artist profile title that overflows the pill',
  },
};

/** Rtl: right-to-left layout. */
export const Rtl: Story = {
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
