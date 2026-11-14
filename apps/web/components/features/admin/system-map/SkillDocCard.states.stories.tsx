import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { SkillDocCard } from './SkillDocCard';

function WidthDecorator(Story: () => ReactNode) {
  return (
    <div className='w-full max-w-2xl'>
      <Story />
    </div>
  );
}

function RtlWidthDecorator(Story: () => ReactNode) {
  return (
    <div className='w-full max-w-2xl' dir='rtl'>
      <Story />
    </div>
  );
}

const LONG_NAME =
  'Release Planner for multi-territory deluxe anniversary editions with staggered single drops';
const LONG_DESCRIPTION =
  'Builds a release plan from the artist timeline, the distributor delivery windows, every confirmed press date and the merch production schedule, then explains each step so the artist can change the plan without losing the reasons behind it.';

/** State coverage for the skill card: no prompt doc, long copy, and RTL. */
const meta = {
  title: 'Features/Admin/System Map/SkillDocCard States',
  component: SkillDocCard,
  parameters: { layout: 'padded' },
  decorators: [WidthDecorator],
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

/** Empty: a skill with no prompt doc says so when it is opened. */
export const EmptyPromptDoc: Story = {
  args: { id: 'missing-prompt', promptContent: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole('button', { name: /Release Planner/ });
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(
      canvas.getByText('No prompt doc for this skill.')
    ).toBeVisible();
  },
};

/** Long content: a long name, description and model id wrap in the card. */
export const LongContentSkill: Story = {
  args: {
    name: LONG_NAME,
    description: LONG_DESCRIPTION,
    model: 'openai/gpt-5-extended-reasoning-preview-2026-10-04',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(LONG_NAME)).toBeVisible();
    await expect(canvas.getByText(LONG_DESCRIPTION)).toBeVisible();
  },
};

/** Right-to-left: the chevron, name and badges mirror in an RTL document. */
export const RtlSkill: Story = {
  args: {
    name: 'مخطط الإصدار',
    description: 'يبني خطة إصدار من الجدول الزمني للفنان.',
  },
  decorators: [RtlWidthDecorator],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('مخطط الإصدار')).toBeVisible();
  },
};
