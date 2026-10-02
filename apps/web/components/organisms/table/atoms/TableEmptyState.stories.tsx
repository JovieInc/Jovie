import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TableEmptyState } from './TableEmptyState';

const addReleaseAction: { label: string; onClick: () => void } = {
  label: 'Add Release',
  onClick: () => undefined,
};

const importFromSpotifyAction: { label: string; href: string } = {
  label: 'Import from Spotify',
  href: '/import/spotify',
};

const meta = {
  title: 'Organisms/Table/TableEmptyState',
  component: TableEmptyState,
  parameters: {
    layout: 'centered',
  },
  args: {
    heading: 'No releases yet',
    description: 'Add your first release to start building your smart links.',
  },
  decorators: [
    Story => (
      <div className='w-[30rem]'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TableEmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithAction: Story = {
  render: () => (
    <TableEmptyState
      heading='No releases yet'
      description='Add your first release to start building your smart links.'
      action={addReleaseAction}
    />
  ),
};

export const WithSecondaryAction: Story = {
  render: () => (
    <TableEmptyState
      heading='No releases yet'
      description='Add your first release to start building your smart links.'
      action={addReleaseAction}
      secondaryAction={importFromSpotifyAction}
    />
  ),
};
