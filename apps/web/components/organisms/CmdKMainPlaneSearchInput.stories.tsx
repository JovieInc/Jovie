import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { CmdKMainPlaneSearchInput } from './CmdKMainPlaneSearchInput';

const meta = {
  title: 'Organisms/CmdKMainPlaneSearchInput',
  component: CmdKMainPlaneSearchInput,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-[min(42rem,calc(100vw-2rem))] rounded-lg border border-(--app-shell-frame-seam) bg-(--app-shell-content-surface) p-3'>
        <p id='palette-description' className='sr-only'>
          Type to search every matching item.
        </p>
        <Story />
        <div id='palette-results' role='listbox' className='sr-only'>
          <div
            id='palette-row-1'
            role='option'
            tabIndex={-1}
            aria-selected='true'
          >
            Profile
          </div>
        </div>
      </div>
    ),
  ],
  args: {
    value: '',
    open: true,
    onQueryChange: fn(),
    onKeyDown: fn(),
    listId: 'palette-results',
    activeRowId: 'palette-row-1',
    descriptionId: 'palette-description',
  },
} satisfies Meta<typeof CmdKMainPlaneSearchInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EmptyQuery: Story = {};

export const ActiveQuery: Story = {
  args: {
    value: 'Release plan',
  },
};
