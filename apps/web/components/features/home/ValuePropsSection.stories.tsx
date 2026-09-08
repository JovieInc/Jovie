import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ValuePropsSection } from './ValuePropsSection';

const meta = {
  title: 'Marketing/Sections/ValuePropsSection',
  component: ValuePropsSection,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof ValuePropsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
