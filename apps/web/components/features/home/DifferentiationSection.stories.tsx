import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DifferentiationSection } from './DifferentiationSection';

const meta = {
  title: 'Marketing/Sections/DifferentiationSection',
  component: DifferentiationSection,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof DifferentiationSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
