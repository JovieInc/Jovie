import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AudienceLocationCell } from './AudienceLocationCell';

const meta = {
  title: 'Organisms/Table/Atoms/AudienceLocationCell',
  component: AudienceLocationCell,
  parameters: {
    layout: 'centered',
  },
  args: {
    locationLabel: 'Los Angeles, CA',
  },
} satisfies Meta<typeof AudienceLocationCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Unknown: Story = {
  args: {
    locationLabel: null,
  },
};
