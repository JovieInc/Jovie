import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProblemSection } from './ProblemSection';

const meta = {
  title: 'Features/Home/ProblemSection',
  component: ProblemSection,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ProblemSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
