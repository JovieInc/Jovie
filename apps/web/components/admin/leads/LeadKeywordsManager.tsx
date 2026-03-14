'use client';

import { Badge, Button, Switch, Textarea } from '@jovie/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  useAddLeadKeywordsMutation,
  useDeleteLeadKeywordMutation,
  useLeadKeywordsQuery,
  useSeedLeadKeywordsMutation,
  useToggleLeadKeywordMutation,
} from '@/lib/queries';
import { queryKeys } from '@/lib/queries/keys';

export function LeadKeywordsManager() {
  const queryClient = useQueryClient();
  const [newQueries, setNewQueries] = useState('');
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, isLoading } = useLeadKeywordsQuery();
  const addKeywordsMutation = useAddLeadKeywordsMutation();
  const seedFeatureFmMutation = useSeedLeadKeywordsMutation();
  const toggleKeywordMutation = useToggleLeadKeywordMutation();
  const deleteKeywordMutation = useDeleteLeadKeywordMutation();
  const keywords = data?.keywords ?? [];

  async function refreshKeywords() {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.admin.leads.keywords(),
    });
  }

  async function addKeywords() {
    const queries = newQueries
      .split('\n')
      .map(q => q.trim())
      .filter(Boolean);
    if (queries.length === 0) return;

    try {
      const data = await addKeywordsMutation.mutateAsync(queries);
      toast.success(`Added ${data.count} keywords`);
      setNewQueries('');
      await refreshKeywords();
    } catch {
      toast.error('Failed to add keywords');
    }
  }

  async function seedFeatureFm() {
    try {
      const data = await seedFeatureFmMutation.mutateAsync();
      toast.success(
        `Seeded ${data.result.inserted} Feature.fm keywords (${data.result.skipped} already existed)`
      );
      await refreshKeywords();
    } catch {
      toast.error('Failed to seed keywords');
    }
  }

  async function toggleKeyword(id: string, enabled: boolean) {
    setTogglingId(id);
    try {
      await toggleKeywordMutation.mutateAsync({ id, enabled });
      await refreshKeywords();
    } catch {
      toast.error('Failed to toggle keyword');
    } finally {
      setTogglingId(null);
    }
  }

  async function deleteKeyword(id: string) {
    setDeletingId(id);
    try {
      await deleteKeywordMutation.mutateAsync(id);
      toast.success('Keyword deleted');
      await refreshKeywords();
    } catch {
      toast.error('Failed to delete keyword');
    } finally {
      setDeletingId(null);
    }
  }

  if (isLoading) {
    return (
      <div className='rounded-lg border border-subtle p-4 text-sm text-secondary-token'>
        Loading keywords...
      </div>
    );
  }

  return (
    <section className='rounded-lg border border-subtle p-4 sm:p-6'>
      <div className='mb-4 flex items-center justify-between'>
        <div>
          <h2 className='text-sm font-semibold text-primary-token'>
            Discovery keywords
          </h2>
          <p className='mt-1 text-xs text-secondary-token'>
            Google CSE queries used to find new Linktree leads.{' '}
            {keywords.length} keyword{keywords.length === 1 ? '' : 's'}{' '}
            configured.
          </p>
        </div>
        <Button
          variant='outline'
          size='sm'
          onClick={() => void seedFeatureFm()}
          disabled={seedFeatureFmMutation.isPending}
        >
          {seedFeatureFmMutation.isPending ? (
            <Loader2 className='mr-2 h-4 w-4 animate-spin' />
          ) : (
            <Sparkles className='mr-2 h-4 w-4' />
          )}
          Seed Feature.fm
        </Button>
      </div>

      {keywords.length > 0 && (
        <div className='mb-4 max-h-64 space-y-1 overflow-y-auto'>
          {keywords.map(keyword => (
            <div
              key={keyword.id}
              className='flex items-center justify-between gap-2 rounded-md border border-subtle px-3 py-2'
            >
              <div className='flex min-w-0 flex-1 items-center gap-2'>
                <Switch
                  checked={keyword.enabled}
                  onCheckedChange={checked =>
                    void toggleKeyword(keyword.id, checked)
                  }
                  disabled={togglingId === keyword.id}
                  aria-label={`Toggle ${keyword.query}`}
                />
                <code className='truncate text-xs text-primary-token'>
                  {keyword.query}
                </code>
              </div>
              <div className='flex items-center gap-2'>
                <Badge variant='secondary' className='text-2xs'>
                  {keyword.resultsFoundTotal} results
                </Badge>
                <button
                  type='button'
                  onClick={() => void deleteKeyword(keyword.id)}
                  disabled={deletingId === keyword.id}
                  className='rounded-md p-1 text-destructive hover:bg-destructive/10 disabled:opacity-50'
                  title='Delete keyword'
                >
                  {deletingId === keyword.id ? (
                    <Loader2 className='h-4 w-4 animate-spin' />
                  ) : (
                    <Trash2 className='h-4 w-4' />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className='space-y-2'>
        <Textarea
          rows={3}
          value={newQueries}
          onChange={e => setNewQueries(e.target.value)}
          placeholder='One keyword per line\nsite:linktr.ee "music" "spotify"\nsite:linktr.ee "artist" "tour"'
          className='text-xs'
        />
        <Button
          size='sm'
          onClick={() => void addKeywords()}
          disabled={
            addKeywordsMutation.isPending || newQueries.trim().length === 0
          }
        >
          {addKeywordsMutation.isPending ? (
            <Loader2 className='mr-2 h-4 w-4 animate-spin' />
          ) : (
            <Plus className='mr-2 h-4 w-4' />
          )}
          Add keywords
        </Button>
      </div>
    </section>
  );
}
