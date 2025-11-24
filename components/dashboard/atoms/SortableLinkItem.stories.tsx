import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  type DetectedLink,
  detectPlatform,
} from '@/lib/utils/platform-detection';
import { SortableLinkItem } from '../molecules/SortableLinkItem';

interface LinkItem extends DetectedLink {
  id: string;
  title: string;
  isVisible: boolean;
  order: number;
}

const detected = detectPlatform('https://open.spotify.com/artist/123');

const defaultLink: LinkItem = {
  ...detected,
  id: '1',
  title: 'Spotify',
  isVisible: true,
  order: 0,
};

const meta: Meta<typeof SortableLinkItem> = {
  title: 'Dashboard/Molecules/SortableLinkItem',
  component: SortableLinkItem,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

function Wrapper(args: LinkItemStoryProps) {
  return (
    <DndContext>
      <SortableContext items={[args.link.id]}>
        <SortableLinkItem {...args} />
      </SortableContext>
    </DndContext>
  );
}

interface LinkItemStoryProps {
  link: LinkItem;
  onUpdate: (id: string, updates: Partial<LinkItem>) => void;
  onDelete: (id: string) => void;
  disabled?: boolean;
}

export const Default: Story = {
  render: Wrapper,
  args: {
    link: defaultLink,
    onUpdate: () => {},
    onDelete: () => {},
  },
};

export const Hidden: Story = {
  render: Wrapper,
  args: {
    link: { ...defaultLink, isVisible: false },
    onUpdate: () => {},
    onDelete: () => {},
  },
};

export const Disabled: Story = {
  render: Wrapper,
  args: {
    link: defaultLink,
    onUpdate: () => {},
    onDelete: () => {},
    disabled: true,
  },
};
