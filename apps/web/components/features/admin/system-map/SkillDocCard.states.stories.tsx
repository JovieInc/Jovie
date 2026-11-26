import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SkillDocCard } from './SkillDocCard';

const meta = {
  title: 'Features/Admin/System Map/SkillDocCard/States',
  component: SkillDocCard,
  parameters: { layout: 'centered' },
  args: {
    id: 'release-planner',
    name: 'Release Planner',
    description: 'Builds a release plan from the artist timeline.',
    kind: 'vertical_agent',
    model: 'openai/gpt-5',
    version: '1.0.0',
    promptContent: null,
  },
  render: function SkillDocCardStatesRender(args) {
    return (
      <div className='w-full max-w-2xl'>
        <SkillDocCard {...args} />
      </div>
    );
  },
} satisfies Meta<typeof SkillDocCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a skill with no prompt doc to show once expanded. */
export const EmptyNoPromptDoc: Story = {};

/** Long content: a long name, description and model id wrap in the header. */
export const LongContentHeader: Story = {
  args: {
    name: 'Release Planner for multi-territory, multi-format catalog reissues',
    description:
      'Builds a dated release plan from the artist timeline, the catalog, the label calendar and every connected platform, then keeps each step in sync as dates move.',
    model: 'anthropic/claude-sonnet-with-a-very-long-model-identifier-string',
    promptContent: '# Release Planner\n\nPreserve artist intent.',
  },
};

/** Right-to-left: an Arabic skill card. */
export const RtlCard: Story = {
  args: {
    name: 'مخطط الإصدارات',
    description: 'يبني خطة إصدار من الجدول الزمني للفنان.',
  },
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
