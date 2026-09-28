import { TooltipProvider } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { WaitlistEntryRow } from '@/lib/admin/types';
import type { ApproveStatus } from './types';
import { useWaitlistColumns } from './WaitlistTableColumns';

const entry: WaitlistEntryRow = {
  id: 'wl_1',
  fullName: 'Ari Lane',
  email: 'ari@example.com',
  primaryGoal: 'streams',
  primarySocialUrl: 'https://instagram.com/ari',
  primarySocialPlatform: 'instagram',
  primarySocialUrlNormalized: 'https://instagram.com/ari',
  spotifyUrl: 'https://open.spotify.com/artist/ari',
  spotifyUrlNormalized: 'https://open.spotify.com/artist/ari',
  spotifyArtistName: 'Ari Lane',
  heardAbout: 'A friend',
  status: 'new',
  primarySocialFollowerCount: null,
  createdAt: new Date('2026-01-10T00:00:00.000Z'),
  updatedAt: new Date('2026-01-10T00:00:00.000Z'),
};

interface WaitlistTableColumnsProps {
  readonly entry: WaitlistEntryRow;
  readonly approveStatuses: Readonly<Record<string, ApproveStatus>>;
  readonly onApprove: (entry: Pick<WaitlistEntryRow, 'id' | 'status'>) => void;
}

function WaitlistTableColumns({
  entry: row,
  approveStatuses,
  onApprove,
}: WaitlistTableColumnsProps) {
  const columns = useWaitlistColumns({ approveStatuses, onApprove });
  return (
    <table className='w-full border-collapse text-sm'>
      <thead>
        <tr>
          {columns.map(column => (
            <th
              key={column.id}
              className='border-b border-subtle px-3 py-2 text-left font-medium text-tertiary-token'
            >
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          {columns.map(column => (
            <td key={column.id} className='border-b border-subtle px-3 py-2'>
              {column.cell(row, 0)}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

const meta = {
  title: 'Features/Admin/WaitlistTableColumns',
  component: WaitlistTableColumns,
  parameters: {
    layout: 'padded',
  },
  args: {
    entry,
    approveStatuses: {},
    onApprove: () => {},
  },
  decorators: [
    Story => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof WaitlistTableColumns>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pending: Story = {};

export const Invited: Story = {
  args: {
    entry: { ...entry, status: 'invited' },
  },
};

export const Approving: Story = {
  args: {
    approveStatuses: { wl_1: 'approving' },
  },
};
