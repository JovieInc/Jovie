import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FinalCTASection } from './FinalCTASection';

const meta = {
  title: 'Marketing/Sections/FinalCTASection',
  component: FinalCTASection,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof FinalCTASection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
