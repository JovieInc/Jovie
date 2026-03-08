'use client';

import { Badge, Button } from '@jovie/ui';
import { ChevronLeft, ChevronRight, ExternalLink, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

interface ReviewLead {
  id: string;
  displayName: string | null;
  contactEmail: string | null;
  instagramHandle: string | null;
  priorityScore: number | null;
  fitScore: number | null;
  outreachStatus: string;
  signals: {
    emailSuspicious?: boolean;
    emailInvalid?: boolean;
    hasRepresentation?: boolean;
  };
}

interface ReviewQueueResponse {
  items: ReviewLead[];
  total: number;
  page: number;
  limit: number;
}

const SIGNAL_CONFIG: Record<
  string,
  { label: string; variant: 'warning' | 'error' | 'primary' }
> = {
  emailSuspicious: { label: 'Suspicious Email', variant: 'warning' },
  emailInvalid: { label: 'Invalid Email', variant: 'error' },
  hasRepresentation: { label: 'Has Representation', variant: 'primary' },
};

export default function AdminOutreachReviewPage() {
  const [leads, setLeads] = useState<ReviewLead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [skippingId, setSkippingId] = useState<string | null>(null);
  const limit = 50;

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        queue: 'manual_review',
        sort: 'priorityScore',
        sortOrder: 'desc',
        page: String(page),
        limit: String(limit),
      });
      const res = await fetch(`/api/admin/outreach?${params}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Failed to load review queue');
      const data = (await res.json()) as ReviewQueueResponse;
      setLeads(data.items);
      setTotal(data.total);
    } catch {
      toast.error('Failed to load review queue');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void fetchQueue();
  }, [fetchQueue]);

  async function handleSkip(id: string) {
    setSkippingId(id);
    try {
      const res = await fetch(`/api/admin/leads/${id}/skip`, {
        method: 'PATCH',
      });
      if (!res.ok) throw new Error('Failed to skip lead');
      toast.success('Lead skipped');
      await fetchQueue();
    } catch {
      toast.error('Failed to skip lead');
    } finally {
      setSkippingId(null);
    }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className='flex flex-col gap-6 p-4 sm:p-6'>
      <section className='rounded-lg border border-subtle p-4 sm:p-6'>
        <div className='mb-4'>
          <h2 className='text-sm font-semibold text-primary-token'>
            Manual Review ({total})
          </h2>
        </div>

        <div className='overflow-x-auto'>
          <table className='w-full text-xs'>
            <thead>
              <tr className='border-b border-subtle text-left text-secondary-token'>
                <th className='pb-2 pr-3 font-medium'>Name</th>
                <th className='pb-2 pr-3 font-medium'>Priority</th>
                <th className='pb-2 pr-3 font-medium'>Fit Score</th>
                <th className='pb-2 pr-3 font-medium'>Email</th>
                <th className='pb-2 pr-3 font-medium'>Instagram</th>
                <th className='pb-2 pr-3 font-medium'>Signals</th>
                <th className='pb-2 font-medium'>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={7}
                    className='py-8 text-center text-secondary-token'
                  >
                    <Loader2 className='mx-auto size-5 animate-spin' />
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className='py-8 text-center text-secondary-token'
                  >
                    No leads pending review
                  </td>
                </tr>
              ) : (
                leads.map(lead => (
                  <tr
                    key={lead.id}
                    className='border-b border-subtle hover:bg-white/[0.03]'
                  >
                    <td className='py-2.5 pr-3'>
                      <span className='font-medium text-primary-token'>
                        {lead.displayName || '-'}
                      </span>
                    </td>
                    <td className='py-2.5 pr-3 tabular-nums'>
                      {lead.priorityScore ?? '-'}
                    </td>
                    <td className='py-2.5 pr-3 tabular-nums'>
                      {lead.fitScore ?? '-'}
                    </td>
                    <td className='py-2.5 pr-3 text-secondary-token'>
                      {lead.contactEmail || '-'}
                    </td>
                    <td className='py-2.5 pr-3'>
                      {lead.instagramHandle ? (
                        <a
                          href={`https://instagram.com/${lead.instagramHandle}`}
                          target='_blank'
                          rel='noopener noreferrer'
                          className='flex items-center gap-1 text-secondary-token hover:text-primary-token'
                        >
                          @{lead.instagramHandle}
                          <ExternalLink className='size-3' />
                        </a>
                      ) : (
                        <span className='text-tertiary-token'>-</span>
                      )}
                    </td>
                    <td className='py-2.5 pr-3'>
                      <div className='flex flex-wrap gap-1'>
                        {lead.signals &&
                          Object.entries(lead.signals).map(
                            ([key, value]) =>
                              value &&
                              SIGNAL_CONFIG[key] && (
                                <Badge
                                  key={key}
                                  variant={SIGNAL_CONFIG[key].variant}
                                  className='text-2xs'
                                >
                                  {SIGNAL_CONFIG[key].label}
                                </Badge>
                              )
                          )}
                      </div>
                    </td>
                    <td className='py-2.5'>
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={() => void handleSkip(lead.id)}
                        disabled={skippingId === lead.id}
                      >
                        {skippingId === lead.id ? (
                          <Loader2 className='mr-1.5 size-3.5 animate-spin' />
                        ) : null}
                        Skip
                      </Button>
                    </td>
                  </tr>
                ))
              )}
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
                disabled={page === 1 || loading}
              >
                <ChevronLeft className='size-4' />
              </Button>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages || loading}
              >
                <ChevronRight className='size-4' />
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
