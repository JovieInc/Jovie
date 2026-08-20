import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SkillDocCard } from './SkillDocCard';

const meta = {
  title: 'Features/Admin/System Map/SkillDocCard',
  component: SkillDocCard,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='w-[min(42rem,calc(100vw-2rem))]'>
        <Story />
      </div>
    ),
  ],
  args: {
    id: 'release-planner',
    name: 'Release Planner',
    description: 'Builds a release plan from the artist timeline.',
    kind: 'vertical_agent',
    model: 'openai/gpt-5',
    version: '1.0.0',
    promptContent:
      '# Release Planner\n\nPreserve artist intent and explain each step.',
  },
} satisfies Meta<typeof SkillDocCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithPrompt: Story = {};

export const MissingPrompt: Story = {
  args: {
    id: 'missing-prompt',
    promptContent: null,
  },
};
