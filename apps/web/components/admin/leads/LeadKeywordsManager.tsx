'use client';

import { Badge, Button, Switch, Textarea } from '@jovie/ui';
import { Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AppIconButton } from '@/components/atoms/AppIconButton';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';

interface Keyword {
  id: string;
  query: string;
  enabled: boolean;
  resultsFoundTotal: number;
  lastUsedAt: string | null;
}

export function LeadKeywordsManager() {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [newQueries, setNewQueries] = useState('');
  const [adding, setAdding] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchKeywords = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/leads/keywords', {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Failed to load keywords');
      const data = (await res.json()) as { keywords: Keyword[] };
      setKeywords(data.keywords);
    } catch {
      toast.error('Failed to load keywords');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeywords();
  }, [fetchKeywords]);

  async function addKeywords() {
    const queries = newQueries
      .split('\n')
      .map(q => q.trim())
      .filter(Boolean);
    if (queries.length === 0) return;

    setAdding(true);
    try {
      const res = await fetch('/api/admin/leads/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries }),
      });
      if (!res.ok) throw new Error('Failed to add keywords');
      const data = (await res.json()) as { count: number };
      toast.success(`Added ${data.count} keywords`);
      setNewQueries('');
      await fetchKeywords();
    } catch {
      toast.error('Failed to add keywords');
    } finally {
      setAdding(false);
    }
  }

  async function seedFeatureFm() {
    setSeeding(true);
    try {
      const res = await fetch('/api/admin/leads/seed', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to seed keywords');
      const data = (await res.json()) as {
        result: { inserted: number; skipped: number };
      };
      toast.success(
        `Seeded ${data.result.inserted} Feature.fm keywords (${data.result.skipped} already existed)`
      );
      await fetchKeywords();
    } catch {
      toast.error('Failed to seed keywords');
    } finally {
      setSeeding(false);
    }
  }

  async function toggleKeyword(id: string, enabled: boolean) {
    setTogglingId(id);
    try {
      const res = await fetch('/api/admin/leads/keywords', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, enabled }),
      });
      if (!res.ok) throw new Error('Failed to toggle keyword');
      setKeywords(prev => prev.map(k => (k.id === id ? { ...k, enabled } : k)));
    } catch {
      toast.error('Failed to toggle keyword');
    } finally {
      setTogglingId(null);
    }
  }

  async function deleteKeyword(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch('/api/admin/leads/keywords', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error('Failed to delete keyword');
      setKeywords(prev => prev.filter(k => k.id !== id));
      toast.success('Keyword deleted');
    } catch {
      toast.error('Failed to delete keyword');
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <ContentSurfaceCard as='section' className='overflow-hidden p-0'>
        <ContentSectionHeader
          title='Discovery keywords'
          subtitle='Google CSE queries used to find new Linktree leads.'
          className='px-5 py-3'
        />
        <div className='px-5 py-4 text-sm text-(--linear-text-secondary)'>
          Loading keywords...
        </div>
      </ContentSurfaceCard>
    );
  }

  return (
    <ContentSurfaceCard as='section' className='overflow-hidden p-0'>
      <ContentSectionHeader
        title='Discovery keywords'
        subtitle={
          <>
            Google CSE queries used to find new Linktree leads.{' '}
            {keywords.length} keyword{keywords.length === 1 ? '' : 's'}{' '}
            configured.
          </>
        }
        className='px-5 py-3'
        actions={
          <Button
            variant='outline'
            size='sm'
            onClick={() => void seedFeatureFm()}
            disabled={seeding}
          >
            {seeding ? (
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            ) : (
              <Sparkles className='mr-2 h-4 w-4' />
            )}
            Seed Feature.fm
          </Button>
        }
        actionsClassName='shrink-0'
      />

      <div className='space-y-4 px-5 py-4'>
        {keywords.length > 0 && (
          <div className='max-h-72 space-y-2 overflow-y-auto pr-1'>
            {keywords.map(keyword => (
              <ContentSurfaceCard
                key={keyword.id}
                className='flex items-center justify-between gap-3 bg-(--linear-bg-surface-0) p-3.5'
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
                  <code className='truncate text-xs text-(--linear-text-primary)'>
                    {keyword.query}
                  </code>
                </div>
                <div className='flex items-center gap-2'>
                  <Badge variant='secondary' className='text-2xs'>
                    {keyword.resultsFoundTotal} results
                  </Badge>
                  <AppIconButton
                    onClick={() => void deleteKeyword(keyword.id)}
                    disabled={deletingId === keyword.id}
                    ariaLabel={`Delete ${keyword.query}`}
                    className='h-7 w-7 rounded-[7px] border-(--linear-border-subtle) bg-transparent text-(--linear-text-tertiary) hover:text-destructive'
                  >
                    {deletingId === keyword.id ? (
                      <Loader2 className='h-3.5 w-3.5 animate-spin' />
                    ) : (
                      <Trash2 className='h-3.5 w-3.5' />
                    )}
                  </AppIconButton>
                </div>
              </ContentSurfaceCard>
            ))}
          </div>
        )}

        <ContentSurfaceCard className='space-y-3 bg-(--linear-bg-surface-0) p-3.5'>
          <Textarea
            value={newQueries}
            onChange={e => setNewQueries(e.target.value)}
            placeholder={
              'Add keywords (one per line):\nsite:linktr.ee "ffm.to"\nsite:linktr.ee "feature.fm" spotify'
            }
            rows={3}
            className='text-xs'
          />
          <div className='flex justify-end'>
            <Button
              size='sm'
              onClick={() => void addKeywords()}
              disabled={adding || !newQueries.trim()}
            >
              {adding ? (
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              ) : (
                <Plus className='mr-2 h-4 w-4' />
              )}
              Add keywords
            </Button>
          </div>
        </ContentSurfaceCard>
      </div>
    </ContentSurfaceCard>
  );
}
