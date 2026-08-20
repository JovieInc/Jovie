import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { KeyboardShortcutsSheet } from './KeyboardShortcutsSheet';

const meta = {
  title: 'Organisms/KeyboardShortcutsSheet',
  component: KeyboardShortcutsSheet,
} satisfies Meta<typeof KeyboardShortcutsSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
