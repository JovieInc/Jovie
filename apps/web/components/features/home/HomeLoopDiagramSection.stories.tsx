import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomeLoopDiagramSection } from './HomeLoopDiagramSection';

const meta = {
  title: 'Marketing/Sections/HomeLoopDiagramSection',
  component: HomeLoopDiagramSection,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof HomeLoopDiagramSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
