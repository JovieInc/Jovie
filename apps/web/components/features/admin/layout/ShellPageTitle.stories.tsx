import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  HeaderActionsProvider,
  useHeaderActions,
} from '@/contexts/HeaderActionsContext';
import { ShellPageTitle } from './ShellPageTitle';

function HeaderBadgePreview() {
  const { headerBadge } = useHeaderActions();
  return (
    <div className='rounded-md border border-subtle px-3 py-2 text-sm text-secondary-token'>
      Shell breadcrumb: {headerBadge ?? '(none)'}
    </div>
  );
}

const meta = {
  title: 'Features/Admin/ShellPageTitle',
  component: ShellPageTitle,
  parameters: {
    layout: 'centered',
  },
  args: {
    title: 'Certifications',
  },
  decorators: [
    Story => (
      <HeaderActionsProvider>
        <div className='space-y-3'>
          <HeaderBadgePreview />
          <Story />
        </div>
      </HeaderActionsProvider>
    ),
  ],
} satisfies Meta<typeof ShellPageTitle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
