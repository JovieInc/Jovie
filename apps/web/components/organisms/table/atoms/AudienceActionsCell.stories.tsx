import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { AudienceAction } from '@/types';
import { AudienceActionsCell } from './AudienceActionsCell';

const actions: AudienceAction[] = [
  { label: 'Clicked Spotify link' },
  { label: 'Tipped $5' },
  { label: 'Followed on Instagram' },
  { label: 'Viewed profile' },
];

const meta = {
  title: 'Organisms/Table/Atoms/AudienceActionsCell',
  component: AudienceActionsCell,
  parameters: {
    layout: 'centered',
  },
  args: {
    rowId: 'row-1',
    actions,
  },
} satisfies Meta<typeof AudienceActionsCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SingleAction: Story = {
  args: {
    actions: actions.slice(0, 1),
  },
};

export const Empty: Story = {
  args: {
    actions: [],
  },
};
