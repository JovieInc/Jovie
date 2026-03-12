'use client';

import { Badge, Button } from '@jovie/ui';
import { useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  X,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  type AdminLead,
  useLeadsListQuery,
  useUpdateLeadStatusMutation,
} from '@/lib/queries';
import { queryKeys } from '@/lib/queries/keys';

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'discovered', label: 'Discovered' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'disqualified', label: 'Disqualified' },
  { value: 'approved', label: 'Approved' },
  { value: 'ingested', label: 'Ingested' },
  { value: 'rejected', label: 'Rejected' },
] as const;

const STATUS_VARIANT: Record<
  string,
  'primary' | 'secondary' | 'success' | 'warning' | 'error'
> = {
  discovered: 'secondary',
  qualified: 'success',
  disqualified: 'error',
  approved: 'primary',
  ingested: 'secondary',
  rejected: 'error',
};

interface LeadTableProps {
  readonly refreshKey?: number;
}

function renderLeadRows(
  loading: boolean,
  loadError: string | null,
  leads: AdminLead[],
  renderRow: (lead: AdminLead) => ReactNode
): ReactNode {
  if (loading) {
    return (
      <tr>
        <td colSpan={6} className='py-8 text-center text-secondary-token'>
          <Loader2 className='mx-auto h-5 w-5 animate-spin' />
        </td>
      </tr>
    );
  }
  if (loadError) {
    return (
      <tr>
        <td colSpan={6} className='py-8 text-center text-secondary-token'>
          {loadError}
        </td>
      </tr>
    );
  }
  if (leads.length === 0) {
    return (
      <tr>
        <td colSpan={6} className='py-8 text-center text-secondary-token'>
          No leads found
        </td>
      </tr>
    );
  }
  return leads.map(renderRow);
}

export function LeadTable({ refreshKey = 0 }: LeadTableProps) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'createdAt' | 'fitScore'>('createdAt');
  const [actioningId, setActioningId] = useState<string | null>(null);
  const limit = 25;

  const leadsQuery = useLeadsListQuery({
    page,
    limit,
    sortBy,
    status: statusFilter || undefined,
    search: search || undefined,
  });
  const updateLeadStatusMutation = useUpdateLeadStatusMutation();

  useEffect(() => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.admin.leads.all(),
    });
  }, [queryClient, refreshKey]);

  const loadError = leadsQuery.isError
    ? 'Unable to load leads right now. Try again in a moment.'
    : null;
  const leads = leadsQuery.data?.items ?? [];
  const total = leadsQuery.data?.total ?? 0;

  async function updateLeadStatus(id: string, status: 'approved' | 'rejected') {
    setActioningId(id);
    try {
      const data = await updateLeadStatusMutation.mutateAsync({ id, status });

      if (status === 'approved' && data.ingestion) {
        if (data.ingestion.success) {
          toast.success(
            `Lead approved and ingested as @${data.ingestion.profileUsername}`
          );
        } else {
          toast.warning(
            `Lead approved but ingestion failed: ${data.ingestion.error}`
          );
        }
      } else {
        toast.success(`Lead ${status}`);
      }

      await queryClient.invalidateQueries({
        queryKey: queryKeys.admin.leads.all(),
      });
    } catch {
      toast.error(`Failed to ${status} lead`);
    } finally {
      setActioningId(null);
    }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <section className='rounded-lg border border-subtle bg-surface-1 p-4 sm:p-6'>
      <div className='mb-4'>
        <h2 className='text-sm font-semibold text-primary-token'>
          Leads ({total})
        </h2>
      </div>

      <div className='mb-4 flex flex-wrap items-center gap-2'>
        {STATUS_OPTIONS.map(opt => (
          <button
            key={opt.value}
            type='button'
            onClick={() => {
              setStatusFilter(opt.value);
              setPage(1);
            }}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === opt.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-surface-2 text-secondary-token hover:bg-surface-3'
            }`}
          >
            {opt.label}
          </button>
        ))}

        <input
          type='text'
          placeholder='Search handle or name...'
          value={search}
          onChange={e => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className='ml-auto h-8 w-48 rounded-md border border-subtle bg-surface-2 px-3 text-xs text-primary-token'
        />

        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as 'createdAt' | 'fitScore')}
          className='h-8 rounded-md border border-subtle bg-surface-2 px-2 text-xs text-primary-token'
        >
          <option value='createdAt'>Newest</option>
          <option value='fitScore'>Fit Score</option>
        </select>
      </div>

      <div className='overflow-x-auto'>
        <table className='w-full text-xs'>
          <thead>
            <tr className='border-b border-subtle text-left text-secondary-token'>
              <th className='pb-2 pr-3 font-medium'>Name / Handle</th>
              <th className='pb-2 pr-3 font-medium'>Status</th>
              <th className='pb-2 pr-3 font-medium'>Score</th>
              <th className='pb-2 pr-3 font-medium'>Signals</th>
              <th className='pb-2 pr-3 font-medium'>Tools</th>
              <th className='pb-2 font-medium'>Actions</th>
            </tr>
          </thead>
          <tbody>
            {renderLeadRows(leadsQuery.isLoading, loadError, leads, lead => (
              <tr
                key={lead.id}
                className='border-b border-subtle/50 hover:bg-white/[0.02]'
              >
                <td className='py-2.5 pr-3'>
                  <div className='flex flex-col'>
                    <span className='font-medium text-primary-token'>
                      {lead.displayName || lead.linktreeHandle}
                    </span>
                    <a
                      href={lead.linktreeUrl}
                      target='_blank'
                      rel='noopener noreferrer'
                      className='flex items-center gap-1 text-secondary-token hover:text-primary-token'
                    >
                      @{lead.linktreeHandle}
                      <ExternalLink className='h-3 w-3' />
                    </a>
                  </div>
                </td>
                <td className='py-2.5 pr-3'>
                  <Badge variant={STATUS_VARIANT[lead.status] ?? 'secondary'}>
                    {lead.status}
                  </Badge>
                </td>
                <td className='py-2.5 pr-3 tabular-nums'>
                  {lead.fitScore ?? '-'}
                </td>
                <td className='py-2.5 pr-3'>
                  <div className='flex gap-1'>
                    {lead.hasSpotifyLink && (
                      <Badge variant='secondary' className='text-2xs'>
                        Spotify
                      </Badge>
                    )}
                    {lead.hasPaidTier && (
                      <Badge variant='secondary' className='text-2xs'>
                        Paid
                      </Badge>
                    )}
                    {lead.hasInstagram && (
                      <Badge variant='secondary' className='text-2xs'>
                        IG
                      </Badge>
                    )}
                    {lead.contactEmail && (
                      <Badge variant='secondary' className='text-2xs'>
                        Email
                      </Badge>
                    )}
                  </div>
                </td>
                <td className='py-2.5 pr-3'>
                  {lead.musicToolsDetected.length > 0 ? (
                    <span className='text-secondary-token'>
                      {lead.musicToolsDetected.join(', ')}
                    </span>
                  ) : (
                    <span className='text-tertiary-token'>-</span>
                  )}
                </td>
                <td className='py-2.5'>
                  {(lead.status === 'qualified' ||
                    lead.status === 'discovered') && (
                    <div className='flex gap-1'>
                      <button
                        type='button'
                        onClick={() =>
                          void updateLeadStatus(lead.id, 'approved')
                        }
                        disabled={actioningId === lead.id}
                        className='rounded-md p-1 text-success hover:bg-success/10 disabled:opacity-50'
                        title='Approve & ingest'
                      >
                        {actioningId === lead.id ? (
                          <Loader2 className='h-4 w-4 animate-spin' />
                        ) : (
                          <Check className='h-4 w-4' />
                        )}
                      </button>
                      <button
                        type='button'
                        onClick={() =>
                          void updateLeadStatus(lead.id, 'rejected')
                        }
                        disabled={actioningId === lead.id}
                        className='rounded-md p-1 text-destructive hover:bg-destructive/10 disabled:opacity-50'
                        title='Reject'
                      >
                        <X className='h-4 w-4' />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className='mt-3 flex items-center justify-between'>
          <span className='text-xs text-secondary-token'>
            Page {page} of {totalPages}
          </span>
          <div className='flex gap-1'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || leadsQuery.isLoading}
            >
              <ChevronLeft className='h-4 w-4' />
            </Button>
            <Button
              variant='outline'
              size='sm'
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || leadsQuery.isLoading}
            >
              <ChevronRight className='h-4 w-4' />
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
