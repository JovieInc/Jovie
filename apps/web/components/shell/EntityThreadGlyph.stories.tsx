import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { EntityThreadGlyph } from './EntityThreadGlyph';

const meta = {
  title: 'Shell/EntityThreadGlyph',
  component: EntityThreadGlyph,
  parameters: {
    layout: 'centered',
  },
  args: {
    threadTitle: 'Update release copy for Midnight Static',
    onOpen: fn(),
  },
} satisfies Meta<typeof EntityThreadGlyph>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CustomTooltipLabel: Story = {
  args: {
    tooltipLabel: 'Mastering thread running — open chat',
  },
};
