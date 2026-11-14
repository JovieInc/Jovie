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

export const EmptyReleases: Story = {
  render: () => (
    <TableEmptyState
      heading='No releases yet'
      description='Add your first release to start building your smart links.'
      action={addReleaseAction}
      secondaryAction={importFromSpotifyAction}
    />
  ),
};

export const PartialHeadingOnly: Story = {
  render: () => <TableEmptyState heading='No contacts match this view' />,
};

export const LongContent: Story = {
  render: () => (
    <TableEmptyState
      heading='No releases from The Extraordinarily Long Named Midnight Orchestra Collective yet'
      description='Once your distributor delivers the deluxe anniversary edition, every remastered track, alternate take and live recording will appear here with its own smart link, so you can share each one without rebuilding your page.'
      action={{
        label: 'Add Release From Your Distributor',
        onClick: () => undefined,
      }}
    />
  ),
};

export const OfflineCannotLoad: Story = {
  render: () => (
    <TableEmptyState
      variant='error'
      heading='You are offline'
      description='Reconnect to the internet to load your releases.'
      action={{ label: 'Try Again', onClick: () => undefined }}
    />
  ),
};

export const RtlArabic: Story = {
  render: () => (
    <div dir='rtl' lang='ar'>
      <TableEmptyState
        heading='لا توجد إصدارات بعد'
        description='أضف إصدارك الأول لبدء إنشاء روابطك الذكية.'
        action={{ label: 'إضافة إصدار', onClick: () => undefined }}
      />
    </div>
  ),
};
