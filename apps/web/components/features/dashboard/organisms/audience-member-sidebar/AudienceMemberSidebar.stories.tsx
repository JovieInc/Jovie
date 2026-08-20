import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { DEMO_AUDIENCE_MEMBERS } from '@/components/features/demo/mock-release-data';
import { AudienceMemberSidebar } from './AudienceMemberSidebar';

const meta = {
  title: 'Features/Dashboard/Audience/AudienceMemberSidebar',
  component: AudienceMemberSidebar,
  args: {
    member: DEMO_AUDIENCE_MEMBERS[0] ?? null,
    isOpen: true,
    onClose: fn(),
  },
} satisfies Meta<typeof AudienceMemberSidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Selected: Story = {};
