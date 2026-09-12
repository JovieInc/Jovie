import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { AudienceRowSelectionCell } from './AudienceRowSelectionCell';

const meta = {
  title: 'Organisms/Table/Atoms/AudienceRowSelectionCell',
  component: AudienceRowSelectionCell,
  parameters: {
    layout: 'centered',
  },
  args: {
    rowNumber: 1,
    isChecked: false,
    displayName: 'Ada Lovelace',
    onToggle: fn(),
  },
} satisfies Meta<typeof AudienceRowSelectionCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Checked: Story = {
  args: {
    isChecked: true,
  },
};
