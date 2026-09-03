import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FlagRow } from './DevToolbarRows';

const meta = {
  title: 'Features/Dev/DevToolbarRows',
  component: FlagRow,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof FlagRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: 'claim handle',
    isOverridden: false,
    checked: false,
    source: 'code',
    onCheckedChange: () => undefined,
    onClear: () => undefined,
  },
};

export const Overridden: Story = {
  args: {
    label: 'Spotify OAuth',
    isOverridden: true,
    checked: true,
    serverDefault: false,
    onCheckedChange: () => undefined,
    onClear: () => undefined,
  },
};
