import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AudienceReturningCell } from './AudienceReturningCell';

const meta = {
  title: 'Organisms/Table/Atoms/AudienceReturningCell',
  component: AudienceReturningCell,
  parameters: {
    layout: 'centered',
  },
  args: {
    visits: 3,
  },
} satisfies Meta<typeof AudienceReturningCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Returning: Story = {};

export const FirstVisit: Story = {
  args: {
    visits: 1,
  },
};

export const New: Story = {
  args: {
    visits: 0,
  },
};
