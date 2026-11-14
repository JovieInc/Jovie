import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Music } from 'lucide-react';
import { SidebarProvider } from '@/components/organisms/sidebar';
import { SidebarCollapsibleGroup } from './SidebarCollapsibleGroup';

const meta = {
  title: 'Organisms/SidebarCollapsibleGroup',
  component: SidebarCollapsibleGroup,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <SidebarProvider>
        <div className='w-56 p-4'>
          <Story />
        </div>
      </SidebarProvider>
    ),
  ],
  args: {
    label: 'Section',
    children: <div className='px-2.5 py-2 text-xs'>Group content</div>,
  },
} satisfies Meta<typeof SidebarCollapsibleGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Collapsed: Story = {
  args: { defaultOpen: false },
};

export const WithIcon: Story = {
  args: { icon: Music },
};

/** A section with nothing in it yet keeps its header and a quiet line. */
export const EmptySection: Story = {
  args: {
    label: 'Playlists',
    children: (
      <p className='px-2.5 py-2 text-xs text-tertiary-token'>
        No playlists yet
      </p>
    ),
  },
};

/**
 * Storage is blocked (private mode, strict cookies): the remembered state
 * cannot load or save, so the group falls back to its default.
 */
export const ErrorStorageUnavailable: Story = {
  args: { storageKey: 'story-storage-blocked', defaultOpen: false },
  beforeEach: () => {
    const { getItem, setItem } = Storage.prototype;
    Storage.prototype.getItem = () => {
      throw new DOMException('Storage is unavailable', 'SecurityError');
    };
    Storage.prototype.setItem = () => {
      throw new DOMException('Storage is unavailable', 'SecurityError');
    };
    return () => {
      Storage.prototype.getItem = getItem;
      Storage.prototype.setItem = setItem;
    };
  },
};

/** Label and rows only: no rail icon. */
export const PartialWithoutIcon: Story = {
  args: { icon: undefined, label: 'Releases' },
};

export const LongContentLabel: Story = {
  args: {
    label:
      'Playlists for The Extraordinarily Long Album Title (Deluxe Anniversary Remastered Edition)',
  },
};

export const RtlSection: Story = {
  args: {
    label: 'قوائم التشغيل',
    children: <div className='px-2.5 py-2 text-xs'>محتوى المجموعة</div>,
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
