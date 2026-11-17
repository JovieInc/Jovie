import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { WorkspaceTabsSurface } from './WorkspaceTabsSurface';

/**
 * State coverage for the URL-backed workspace tabs. These render the same
 * surface as WorkspaceTabsSurface.stories.tsx and change only the views the
 * caller offers, the copy or the document direction.
 */
const primaryOptions = [
  { value: 'creators', label: 'Creators' },
  { value: 'users', label: 'Users' },
] as const;

const meta = {
  title: 'Organisms/WorkspaceTabsSurface States',
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

/** Empty: a single view, so the surface draws no tab bar at all. */
export const EmptyNoAlternateViews: Story = {
  args: {
    primaryOptions: [{ value: 'creators', label: 'Creators' }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('tablist')).toBeNull();
    await expect(canvas.getByText('Workspace content')).toBeVisible();
  },
};

/** Partial: secondary views offered but none selected, so only primary tabs show. */
export const PartialSecondaryUnselected: Story = {
  args: {
    secondaryParam: 'status',
    secondaryValue: null,
    secondaryOptions: [
      { value: 'active', label: 'Active' },
      { value: 'archived', label: 'Archived' },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole('tablist')).toHaveLength(1);
  },
};

const manyOptions = Array.from({ length: 9 }, (_, index) => ({
  value: `view-${index + 1}`,
  label: `Long view name ${index + 1}`,
}));

/** Long content: long copy and nine tabs that scroll inside the rail. */
export const LongContentManyTabs: Story = {
  args: {
    title: 'People, creators, collaborators and every invited workspace member',
    description:
      'Manage creators, users, collaborators and pending invitations across every workspace you administer, with filters that stay in the URL.',
    primaryValue: 'view-1',
    primaryOptions: manyOptions,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole('tab')).toHaveLength(9);
  },
};

/** Right-to-left: Arabic copy and tabs inside an RTL document. */
export const RtlArabicTabs: Story = {
  args: {
    title: 'الأشخاص',
    description: 'إدارة المبدعين والمستخدمين.',
    primaryOptions: [
      { value: 'creators', label: 'المبدعون' },
      { value: 'users', label: 'المستخدمون' },
    ],
  },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('tab', { name: 'المبدعون' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  },
};
