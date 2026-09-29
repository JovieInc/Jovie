import { DndContext } from '@dnd-kit/core';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import { LinkCategoryGrid } from './LinkCategoryGrid';

function makeLink(
  id: string,
  platformId: string,
  category: 'social' | 'dsp' | 'earnings' | 'custom',
  suggestedTitle: string
): DetectedLink & { id: string } {
  return {
    id,
    platform: {
      id: platformId,
      name: platformId,
      category,
      icon: platformId,
      color: '#6b7280',
      placeholder: '',
    },
    normalizedUrl: `https://example.com/${platformId}`,
    originalUrl: `https://example.com/${platformId}`,
    suggestedTitle,
    isValid: true,
  };
}

const links = [
  makeLink('link-1', 'instagram', 'social', 'Instagram'),
  makeLink('link-2', 'spotify', 'dsp', 'Spotify'),
  makeLink('link-3', 'venmo', 'earnings', 'Venmo'),
];

const meta = {
  title: 'Dashboard/Organisms/Links/LinkCategoryGrid',
  component: LinkCategoryGrid,
  parameters: {
    layout: 'padded',
  },
  decorators: [
    Story => (
      <DndContext>
        <div className='w-96'>
          <Story />
        </div>
      </DndContext>
    ),
  ],
  args: {
    links,
    onLinksChange: () => {},
    onToggle: () => {},
    onRemove: () => {},
    onEdit: () => {},
    openMenuId: null,
    onAnyMenuOpen: () => {},
    lastAddedId: null,
    buildPillLabel: (link: DetectedLink) => link.suggestedTitle,
    addingLink: null,
    pendingPreview: null,
    onAddPendingPreview: () => {},
    onCancelPendingPreview: () => {},
    onHint: () => {},
  },
} satisfies Meta<typeof LinkCategoryGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: {
    links: [],
  },
};

export const AddingLink: Story = {
  args: {
    addingLink: makeLink('link-4', 'tiktok', 'social', 'TikTok'),
  },
};

export const PendingPreview: Story = {
  args: {
    pendingPreview: {
      link: makeLink('link-5', 'youtube', 'dsp', 'YouTube'),
      isDuplicate: false,
    },
  },
};
