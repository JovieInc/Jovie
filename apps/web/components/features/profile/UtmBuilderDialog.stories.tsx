import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { UtmBuilderDialog } from './UtmBuilderDialog';

const meta = {
  title: 'Features/Profile/UtmBuilderDialog',
  component: UtmBuilderDialog,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['open', 'onClose', 'baseUrl'],
    },
  },
} satisfies Meta<typeof UtmBuilderDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
