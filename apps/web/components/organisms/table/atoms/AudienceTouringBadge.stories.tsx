import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AudienceTouringBadge } from './AudienceTouringBadge';

const meta = {
  title: 'Organisms/Table/Atoms/AudienceTouringBadge',
  component: AudienceTouringBadge,
  parameters: {
    layout: 'centered',
  },
  args: {
    touringCity: 'Austin, TX',
    showDate: '2026-11-14',
  },
} satisfies Meta<typeof AudienceTouringBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithoutDate: Story = {
  args: {
    showDate: null,
  },
};

export const NoUpcomingShow: Story = {
  args: {
    touringCity: null,
    showDate: null,
  },
};
