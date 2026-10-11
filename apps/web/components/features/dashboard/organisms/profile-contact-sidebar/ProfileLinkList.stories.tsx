import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { PreviewPanelLink } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { ProfileLinkList } from './ProfileLinkList';

const links: PreviewPanelLink[] = [
  {
    id: 'link-1',
    title: 'Instagram',
    url: 'https://instagram.com/artist',
    platform: 'instagram',
    platformType: 'social',
    category: 'social',
    isVisible: true,
  },
  {
    id: 'link-2',
    title: 'Official site',
    url: 'https://artist.example.com',
    platform: 'website',
    platformType: 'websites',
    category: 'other',
    isVisible: true,
  },
];

const meta = {
  title: 'Dashboard/Profile/ProfileLinkList',
  component: ProfileLinkList,
  parameters: { layout: 'centered' },
  args: {
    links,
    selectedCategory: 'all' as const,
  },
} satisfies Meta<typeof ProfileLinkList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: { links: [], selectedCategory: 'earnings' },
};

export const EmptyEditable: Story = {
  args: { links: [], selectedCategory: 'earnings', onAddLink: () => {} },
};
