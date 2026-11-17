import { Input } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PresenceWorkspaceBoundary } from './workspace-controller';

const meta = {
  title: 'Presence/SharedWorkspaceBoundary States',
  component: PresenceWorkspaceBoundary,
  args: {
    scope: {
      actorId: 'qa-actor',
      workspaceId: 'qa-workspace',
      target: 'creator',
    },
    children: null,
  },
} satisfies Meta<typeof PresenceWorkspaceBoundary>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a workspace boundary with nothing mounted inside it yet. */
export const Empty: Story = {};

/** Long content: a long draft inside the workspace. */
export const LongContent: Story = {
  args: {
    children: (
      <Input
        aria-label='Workspace draft'
        defaultValue='A long workspace draft note about every profile, link and platform that still needs a review before the next release goes out'
      />
    ),
  },
};

/** Rtl: an Arabic draft in a right-to-left document. */
export const Rtl: Story = {
  args: {
    scope: {
      actorId: 'qa-actor',
      workspaceId: 'qa-workspace',
      target: 'company',
    },
    children: <Input aria-label='مسودة مساحة العمل' defaultValue='ملاحظة' />,
  },
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
