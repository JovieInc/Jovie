import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PAGE_TOOLBAR_META_TEXT_CLASS, PageToolbar } from './table';
import { WorkspacePage } from './WorkspacePage';

const meta = {
  title: 'Organisms/WorkspacePage',
  component: WorkspacePage,
  parameters: { layout: 'fullscreen' },
  args: {
    frame: 'none',
    contentPadding: 'none',
    toolbar: (
      <PageToolbar
        start={<span className={PAGE_TOOLBAR_META_TEXT_CLASS}>3 items</span>}
        end={<Button size='sm'>Add Item</Button>}
      />
    ),
    children: (
      <div className='flex min-h-80 items-center justify-center'>
        Workspace content
      </div>
    ),
  },
} satisfies Meta<typeof WorkspacePage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
