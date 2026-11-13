import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { renderAvatarCell } from '@/components/features/admin/admin-creator-profiles/utils/column-renderers';
import type { AdminCreatorProfileRow } from '@/lib/admin/types';
import { type ColumnDef, createColumnHelper } from '@/lib/tanstack-table';
import { UnifiedTable } from '../organisms/UnifiedTable';
import { TableCell } from './TableCell';

const meta = {
  title: 'Organisms/Table/Atoms/TableCell',
  component: TableCell,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof TableCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { children: 'Release title' },
  render: () => (
    <table>
      <tbody>
        <tr>
          <TableCell>Release title</TableCell>
          <TableCell align='right'>42</TableCell>
        </tr>
      </tbody>
    </table>
  ),
};

export const SecondaryTone: Story = {
  args: { children: 'Secondary row' },
  render: () => (
    <table>
      <tbody>
        <tr>
          <TableCell className='text-secondary-token'>Secondary row</TableCell>
        </tr>
      </tbody>
    </table>
  ),
};

/** Reproduces the padded inline badges used by the audience table. */
export const InlineBadges: Story = {
  args: { children: 'High' },
  render: () => (
    <table
      style={{ width: 320, tableLayout: 'fixed' }}
      data-testid='inline-badge-table'
    >
      <tbody>
        {(['left', 'center', 'right'] as const).map(align => (
          <tr key={align}>
            <TableCell align={align}>
              <span
                data-testid={`badge-${align}`}
                className='inline-flex items-center rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-2xs font-medium ring-1 ring-emerald-500/25 ring-inset'
              >
                High
              </span>
            </TableCell>
            <TableCell>
              A long email@example.com label that must stay on one line
            </TableCell>
          </tr>
        ))}
      </tbody>
    </table>
  ),
};

const creator: AdminCreatorProfileRow = {
  id: 'creator-geometry',
  username: 'long_creator_username',
  usernameNormalized: 'long_creator_username',
  displayName: 'A long creator display name',
  avatarUrl: '/images/avatars/tim-white.jpg',
  isVerified: true,
  isFeatured: true,
  marketingOptOut: false,
  isClaimed: false,
  claimToken: null,
  claimTokenExpiresAt: null,
  userId: null,
  createdAt: null,
  ingestionStatus: 'idle',
  location: null,
  hometown: null,
  activeSinceYear: null,
  lastIngestionError: null,
};
const creatorColumns = [
  createColumnHelper<AdminCreatorProfileRow>().accessor('username', {
    header: 'Creator',
    cell: renderAvatarCell,
  }),
] as ColumnDef<AdminCreatorProfileRow>[];

export const CreatorIdentity: Story = {
  args: { children: null },
  render: () => (
    <div style={{ width: 320 }} data-testid='creator-identity-table'>
      <UnifiedTable
        data={[creator]}
        columns={creatorColumns}
        minWidth='320px'
        enableVirtualization={false}
      />
    </div>
  ),
};

export const InlineBadgesLight: Story = {
  ...InlineBadges,
  parameters: { themes: { themeOverride: 'light' } },
};

export const CreatorIdentityLight: Story = {
  ...CreatorIdentity,
  parameters: { themes: { themeOverride: 'light' } },
};

/** Long copy clips with an ellipsis inside the fixed row height. */
export const LongContent: Story = {
  args: { children: null },
  render: () => (
    <table style={{ width: 280, tableLayout: 'fixed' }}>
      <tbody>
        <tr>
          <TableCell>
            Never Say A Word (Extended Club Mix) feat. a very long guest list
          </TableCell>
          <TableCell align='right' width='w-16'>
            1,284,019
          </TableCell>
        </tr>
        <tr>
          <TableCell multiline>
            Two-line rows may wrap a long title within their height budget
          </TableCell>
          <TableCell align='right' width='w-16'>
            42
          </TableCell>
        </tr>
      </tbody>
    </table>
  ),
};

export const Rtl: Story = {
  args: { children: null },
  render: () => (
    <table dir='rtl' lang='ar' style={{ width: 280, tableLayout: 'fixed' }}>
      <tbody>
        <tr>
          <TableCell>عنوان الإصدار</TableCell>
          <TableCell align='right' width='w-16'>
            ٤٢
          </TableCell>
        </tr>
      </tbody>
    </table>
  ),
};
