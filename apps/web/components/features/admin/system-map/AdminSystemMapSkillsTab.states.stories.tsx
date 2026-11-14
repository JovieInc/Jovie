import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { expect, within } from 'storybook/test';
import { AdminSystemMapSkillsTab } from './AdminSystemMapSkillsTab';

function RtlDecorator(Story: () => ReactNode) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
}

/**
 * State coverage for the skills tab. It takes no props and lists the
 * checked-in skill registry, so the one state a story can change is the
 * document direction.
 */
const meta = {
  title: 'Features/Admin/System Map/AdminSystemMapSkillsTab States',
  component: AdminSystemMapSkillsTab,
  parameters: { layout: 'padded' },
  decorators: [RtlDecorator],
} satisfies Meta<typeof AdminSystemMapSkillsTab>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Right-to-left: skill cards mirror inside an RTL document. */
export const RtlRegisteredSkills: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('system-map-skills')).toBeVisible();
    await expect(canvas.getAllByRole('button').length).toBeGreaterThan(0);
  },
};
