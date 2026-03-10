'use client';

import { Badge, Button } from '@jovie/ui';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

interface Lead {
  id: string;
  linktreeHandle: string;
  linktreeUrl: string;
  displayName: string | null;
  status: string;
  fitScore: number | null;
  hasPaidTier: boolean | null;
  hasSpotifyLink: boolean;
  hasInstagram: boolean;
  musicToolsDetected: string[];
  contactEmail: string | null;
  createdAt: string;
}

interface LeadListResponse {
  items: Lead[];
  total: number;
  page: number;
  limit: number;
}

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

export function LeadTable({ refreshKey = 0 }: LeadTableProps) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'createdAt' | 'fitScore'>('createdAt');
  const [actioningId, setActioningId] = useState<string | null>(null);
  const limit = 25;

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        sortBy,
        sortOrder: 'desc',
      });
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);

      const res = await fetch(`/api/admin/leads?${params}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Failed to load leads');
      const data = (await res.json()) as LeadListResponse;
      setLeads(data.items);
      setTotal(data.total);
    } catch {
      setLeads([]);
      setTotal(0);
      setLoadError('Unable to load leads right now. Try again in a moment.');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search, sortBy]);

  useEffect(() => {
    void fetchLeads();
  }, [fetchLeads, refreshKey]);

  async function updateLeadStatus(id: string, status: 'approved' | 'rejected') {
    setActioningId(id);
    try {
      const res = await fetch(`/api/admin/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(`Failed to ${status} lead`);
      const data = (await res.json()) as Lead & {
        ingestion?: {
          success: boolean;
          profileUsername?: string;
          error?: string;
        } | null;
      };

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

      await fetchLeads();
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

      {/* Filters */}
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

      {/* Table */}
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
            {loading ? (
              <tr>
                <td
                  colSpan={6}
                  className='py-8 text-center text-secondary-token'
                >
                  <Loader2 className='mx-auto h-5 w-5 animate-spin' />
                </td>
              </tr>
            ) : loadError ? (
              <tr>
                <td
                  colSpan={6}
                  className='py-8 text-center text-secondary-token'
                >
                  {loadError}
                </td>
              </tr>
            ) : leads.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className='py-8 text-center text-secondary-token'
                >
                  No leads found
                </td>
              </tr>
            ) : (
              leads.map(lead => (
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
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
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
              disabled={page === 1 || loading}
            >
              <ChevronLeft className='h-4 w-4' />
            </Button>
            <Button
              variant='outline'
              size='sm'
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || loading}
            >
              <ChevronRight className='h-4 w-4' />
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
