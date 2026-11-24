import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  AppTableCellContent,
  AppTableMediaCell,
  AppTableNumericCell,
  AppTableTextCell,
} from './AppTableCellContent';
import { APP_TABLE_MEDIA_SIZE } from './app-table-row';

const meta = {
  title: 'Organisms/Table/Atoms/AppTableCellContent',
  component: AppTableCellContent,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof AppTableCellContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DenseRow: Story = {
  args: { children: 'Title' },
  render: () => (
    <div
      data-app-table-row='true'
      className='flex h-8 w-96 items-center gap-2 border border-subtle px-2'
    >
      <AppTableMediaCell
        size={APP_TABLE_MEDIA_SIZE.dense}
        className='rounded-sm bg-surface-2'
      />
      <AppTableCellContent className='min-w-0 flex-1'>
        <AppTableTextCell copyValue='Take Me Over' copyLabel='Title'>
          Take Me Over
        </AppTableTextCell>
      </AppTableCellContent>
      <AppTableTextCell tone='meta' truncate={false}>
        Snapd
      </AppTableTextCell>
      <AppTableNumericCell copyValue='20:01' copyLabel='Duration'>
        20:01
      </AppTableNumericCell>
    </div>
  ),
};
