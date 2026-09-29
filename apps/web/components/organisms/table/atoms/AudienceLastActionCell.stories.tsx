import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { AudienceAction } from '@/types';
import { AudienceLastActionCell } from './AudienceLastActionCell';

const actions: AudienceAction[] = [
  { label: 'Clicked Spotify link', platform: 'spotify' },
];

const meta = {
  title: 'Organisms/Table/Atoms/AudienceLastActionCell',
  component: AudienceLastActionCell,
  parameters: {
    layout: 'centered',
  },
  args: {
    actions,
    lastSeenAt: '2026-09-01T12:00:00.000Z',
  },
} satisfies Meta<typeof AudienceLastActionCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NoAction: Story = {
  args: {
    actions: [],
    lastSeenAt: null,
  },
};
