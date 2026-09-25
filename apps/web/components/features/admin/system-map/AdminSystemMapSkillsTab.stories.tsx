import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { AdminSystemMapSkillsTab } from './AdminSystemMapSkillsTab';

const meta = {
  title: 'Features/Admin/System Map/AdminSystemMapSkillsTab',
  component: AdminSystemMapSkillsTab,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof AdminSystemMapSkillsTab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RegisteredSkills: Story = {};

export const RetouchPrompt: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /retouch/i }));
    await expect(
      canvas.getByRole('heading', { name: 'White Space Retouch Style' })
    ).toBeVisible();
  },
};
