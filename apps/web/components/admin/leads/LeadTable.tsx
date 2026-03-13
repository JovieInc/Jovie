'use client';

import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@jovie/ui';
import {
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  X,
} from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DashboardHeaderActionGroup } from '@/components/dashboard/atoms/DashboardHeaderActionGroup';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { HeaderSearchAction } from '@/components/molecules/HeaderSearchAction';
import {
  PAGE_TOOLBAR_END_GROUP_CLASS,
  PAGE_TOOLBAR_ICON_CLASS,
  PAGE_TOOLBAR_MENU_TRIGGER_CLASS,
  PAGE_TOOLBAR_META_TEXT_CLASS,
  PAGE_TOOLBAR_START_CLASS,
  PageToolbar,
  PageToolbarTabButton,
} from '@/components/organisms/table';
import { useSetHeaderActions } from '@/contexts/HeaderActionsContext';
import { cn } from '@/lib/utils';

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

function renderLeadRows(
  loading: boolean,
  loadError: string | null,
  leads: Lead[],
  renderRow: (lead: Lead) => ReactNode
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
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'createdAt' | 'fitScore'>('createdAt');
  const [actioningId, setActioningId] = useState<string | null>(null);
  const { setHeaderActions } = useSetHeaderActions();
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
    fetchLeads();
  }, [fetchLeads, refreshKey]);

  useEffect(() => {
    setHeaderActions(
      <DashboardHeaderActionGroup>
        <HeaderSearchAction
          searchValue={search}
          onSearchValueChange={value => {
            setSearch(value);
            setPage(1);
          }}
          onApply={() => undefined}
          placeholder='Search handle or name...'
          ariaLabel='Search leads'
          submitAriaLabel='Search leads'
          tooltipLabel='Search'
        />
      </DashboardHeaderActionGroup>
    );

    return () => {
      setHeaderActions(null);
    };
  }, [search, setHeaderActions]);

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
    <ContentSurfaceCard as='section' className='overflow-hidden p-0'>
      <ContentSectionHeader
        title='Review queue'
        subtitle='Approve or reject discovered and qualified leads before ingestion.'
        actions={
          <span className={PAGE_TOOLBAR_META_TEXT_CLASS}>
            {total.toLocaleString()} lead{total === 1 ? '' : 's'}
          </span>
        }
        className='px-5 py-3'
      />

      <PageToolbar
        start={STATUS_OPTIONS.map(opt => (
          <PageToolbarTabButton
            key={opt.value}
            label={opt.label}
            active={statusFilter === opt.value}
            onClick={() => {
              setStatusFilter(opt.value);
              setPage(1);
            }}
          />
        ))}
        startClassName={cn(PAGE_TOOLBAR_START_CLASS, 'flex-wrap')}
        end={
          <div className={PAGE_TOOLBAR_END_GROUP_CLASS}>
            <Select
              value={sortBy}
              onValueChange={value =>
                setSortBy(value as 'createdAt' | 'fitScore')
              }
            >
              <SelectTrigger
                aria-label='Sort leads'
                className={cn(
                  PAGE_TOOLBAR_MENU_TRIGGER_CLASS,
                  'h-8 border-transparent bg-transparent'
                )}
              >
                <div className='flex items-center gap-1.5'>
                  <ArrowUpDown className={PAGE_TOOLBAR_ICON_CLASS} />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='createdAt'>Newest</SelectItem>
                <SelectItem value='fitScore'>Fit Score</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      <div className='overflow-x-auto px-5 py-4 pt-3'>
        <table className='w-full text-xs'>
          <thead>
            <tr className='border-b border-(--linear-border-subtle) text-left text-(--linear-text-tertiary)'>
              <th className='pb-2.5 pr-3 text-[11px] font-[510] tracking-[0.04em]'>
                Name / Handle
              </th>
              <th className='pb-2.5 pr-3 text-[11px] font-[510] tracking-[0.04em]'>
                Status
              </th>
              <th className='pb-2.5 pr-3 text-[11px] font-[510] tracking-[0.04em]'>
                Score
              </th>
              <th className='pb-2.5 pr-3 text-[11px] font-[510] tracking-[0.04em]'>
                Signals
              </th>
              <th className='pb-2.5 pr-3 text-[11px] font-[510] tracking-[0.04em]'>
                Tools
              </th>
              <th className='pb-2.5 text-[11px] font-[510] tracking-[0.04em]'>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {renderLeadRows(loading, loadError, leads, lead => (
              <tr
                key={lead.id}
                className='border-b border-(--linear-border-subtle)/60 transition-colors hover:bg-(--linear-bg-surface-0)'
              >
                <td className='py-3 pr-3'>
                  <div className='flex flex-col'>
                    <span className='text-[13px] font-[560] text-(--linear-text-primary)'>
                      {lead.displayName || lead.linktreeHandle}
                    </span>
                    <a
                      href={lead.linktreeUrl}
                      target='_blank'
                      rel='noopener noreferrer'
                      className='flex items-center gap-1 text-[12px] text-(--linear-text-secondary) hover:text-(--linear-text-primary)'
                    >
                      @{lead.linktreeHandle}
                      <ExternalLink className='h-3 w-3' />
                    </a>
                  </div>
                </td>
                <td className='py-3 pr-3'>
                  <Badge variant={STATUS_VARIANT[lead.status] ?? 'secondary'}>
                    {lead.status}
                  </Badge>
                </td>
                <td className='py-3 pr-3 tabular-nums text-[12px] text-(--linear-text-secondary)'>
                  {lead.fitScore ?? '-'}
                </td>
                <td className='py-3 pr-3'>
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
                <td className='py-3 pr-3'>
                  {lead.musicToolsDetected.length > 0 ? (
                    <span className='text-[12px] text-(--linear-text-secondary)'>
                      {lead.musicToolsDetected.join(', ')}
                    </span>
                  ) : (
                    <span className='text-(--linear-text-tertiary)'>-</span>
                  )}
                </td>
                <td className='py-3'>
                  {(lead.status === 'qualified' ||
                    lead.status === 'discovered') && (
                    <div className='flex gap-1'>
                      <button
                        type='button'
                        onClick={() =>
                          void updateLeadStatus(lead.id, 'approved')
                        }
                        disabled={actioningId === lead.id}
                        className='rounded-[7px] p-1.5 text-success transition-colors hover:bg-success/10 disabled:opacity-50'
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
                        className='rounded-[7px] p-1.5 text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50'
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className='flex items-center justify-between border-t border-(--linear-border-subtle) px-5 py-3'>
          <span className='text-xs text-(--linear-text-tertiary)'>
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
    </ContentSurfaceCard>
  );
}
