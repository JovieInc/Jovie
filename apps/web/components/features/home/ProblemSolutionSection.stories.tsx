import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProblemSolutionSection } from './ProblemSolutionSection';

const meta = {
  title: 'Marketing/ProblemSolutionSection',
  component: ProblemSolutionSection,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof ProblemSolutionSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
