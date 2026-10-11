import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Stat } from './Stat';

const meta = {
  title: 'Shell/Stat',
  component: Stat,
  parameters: {
    layout: 'centered',
  },
  args: {
    label: 'Clicks',
    value: '1,247',
  },
} satisfies Meta<typeof Stat>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Tabular: Story = {
  args: {
    label: 'Avg / day',
    value: '178',
    tabular: true,
  },
};

export const Mono: Story = {
  args: {
    label: 'ISRC',
    value: 'USAT22300100',
    mono: true,
  },
};
