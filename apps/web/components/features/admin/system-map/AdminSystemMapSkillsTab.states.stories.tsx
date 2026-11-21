import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AdminSystemMapSkillsTab } from './AdminSystemMapSkillsTab';

const meta = {
  title: 'Features/Admin/System Map/AdminSystemMapSkillsTab/States',
  component: AdminSystemMapSkillsTab,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof AdminSystemMapSkillsTab>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Right-to-left: the registered skills inside an RTL document. */
export const RtlSkills: Story = {
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
