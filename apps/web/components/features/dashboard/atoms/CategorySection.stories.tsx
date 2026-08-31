import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CategorySection } from './CategorySection';

const meta = {
  title: 'Features/Dashboard/Atoms/CategorySection',
  component: CategorySection,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['title'],
    },
  },
} satisfies Meta<typeof CategorySection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
