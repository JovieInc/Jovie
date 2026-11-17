import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DemoAvatar } from './DemoAvatar';
import { DEMO_ASSIGNEES } from './demo-fixtures';

/**
 * State coverage for the demo assignee avatar. The canonical stories stay in
 * DemoAvatar.stories.tsx.
 */
const meta = {
  title: 'Features/Demo/DemoAvatar States',
  component: DemoAvatar,
  parameters: {
    layout: 'centered',
  },
  args: {
    assignee: DEMO_ASSIGNEES[1],
  },
} satisfies Meta<typeof DemoAvatar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: a long name behind three initials at the default size. */
export const LongContentInitials: Story = {
  args: {
    assignee: {
      ...DEMO_ASSIGNEES[2],
      name: 'Mira Chen-Takahashi Okonkwo, Head of Marketing',
      initials: 'MCO',
    },
  },
};

/** Right-to-left: avatars in a row inside an RTL document. */
export const RtlDocument: Story = {
  render: args => (
    <div dir='rtl' className='flex gap-1'>
      {DEMO_ASSIGNEES.map(assignee => (
        <DemoAvatar key={assignee.id} {...args} assignee={assignee} />
      ))}
    </div>
  ),
};
