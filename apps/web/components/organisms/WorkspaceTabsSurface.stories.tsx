import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { WorkspaceTabsSurface } from './WorkspaceTabsSurface';

const primaryOptions = [
  { value: 'creators', label: 'Creators' },
  { value: 'users', label: 'Users' },
] as const;

const meta = {
  title: 'Organisms/WorkspaceTabsSurface',
  component: WorkspaceTabsSurface,
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: '/app/ov/people',
        query: { view: 'creators' },
      },
    },
  },
  decorators: [
    Story => (
      <div className='min-h-80 bg-(--app-shell-content-surface) p-4'>
        <Story />
      </div>
    ),
  ],
  args: {
    title: 'People',
    description: 'Manage creators and users.',
    primaryParam: 'view',
    primaryValue: 'creators',
    primaryOptions,
    children: (
      <div className='py-8 text-secondary-token'>Workspace content</div>
    ),
  },
} satisfies Meta<typeof WorkspaceTabsSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithActions: Story = {
  args: {
    actions: <Button size='sm'>Invite</Button>,
  },
};

export const Headerless: Story = {
  args: {
    headerless: true,
  },
};

export const PrimaryAndSecondary: Story = {
  args: {
    secondaryParam: 'status',
    secondaryValue: 'active',
    secondaryOptions: [
      { value: 'active', label: 'Active' },
      { value: 'archived', label: 'Archived' },
    ],
  },
};
