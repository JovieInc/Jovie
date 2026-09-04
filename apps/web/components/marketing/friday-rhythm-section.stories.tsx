import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FridayRhythmSection } from './friday-rhythm-section';

const meta = {
  title: 'Marketing/Sections/FridayRhythmSection',
  component: FridayRhythmSection,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof FridayRhythmSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
