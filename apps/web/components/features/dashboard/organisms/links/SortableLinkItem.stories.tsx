import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
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

function SortableLinkItemDemo(
  props: Omit<
    Parameters<typeof SortableLinkItem>[0],
    'openMenuId' | 'onAnyMenuOpen'
  >
) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  return (
    <DndContext>
      <SortableContext items={[props.id]}>
        <SortableLinkItem
          {...props}
          openMenuId={openMenuId}
          onAnyMenuOpen={setOpenMenuId}
        />
      </SortableContext>
    </DndContext>
  );
}

const meta = {
  title: 'Dashboard/Organisms/Links/SortableLinkItem',
  parameters: {
    layout: 'centered',
  },
  render: args => (
    <div className='w-96'>
      <SortableLinkItemDemo {...args} />
    </div>
  ),
  args: {
    id: 'link-1',
    link,
    index: 0,
    visible: true,
    isLastAdded: false,
    onToggle: () => {},
    onRemove: () => {},
    onEdit: () => {},
    buildPillLabel: (l: DetectedLink) => l.platform.name,
  },
} satisfies Meta<typeof SortableLinkItemDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Visible: Story = {};

export const Hidden: Story = {
  args: {
    visible: false,
  },
};

export const InvalidLink: Story = {
  args: {
    link: { ...link, isValid: false, error: 'Broken link' },
  },
};

export const JustAdded: Story = {
  args: {
    isLastAdded: true,
  },
};
