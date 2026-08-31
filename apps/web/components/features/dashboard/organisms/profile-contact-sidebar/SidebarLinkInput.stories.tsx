import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SidebarLinkInput } from './SidebarLinkInput';

const meta = {
  title: 'Features/Dashboard/Organisms/ProfileContactSidebar/SidebarLinkInput',
  component: SidebarLinkInput,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: [
        'categoryFilter',
        'existingPlatforms',
        'onAdd',
        'onCancel',
      ],
    },
  },
} satisfies Meta<typeof SidebarLinkInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
