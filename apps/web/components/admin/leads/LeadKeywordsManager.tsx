'use client';

import { Badge, Button, Switch, Textarea } from '@jovie/ui';
import { Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

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
    void fetchKeywords();
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
            {keywords.length} keyword{keywords.length !== 1 ? 's' : ''}{' '}
            configured.
          </p>
        </div>
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
                  className='text-secondary-token hover:text-destructive disabled:opacity-50'
                  aria-label={`Delete ${keyword.query}`}
                >
                  {deletingId === keyword.id ? (
                    <Loader2 className='h-3.5 w-3.5 animate-spin' />
                  ) : (
                    <Trash2 className='h-3.5 w-3.5' />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className='space-y-2'>
        <Textarea
          value={newQueries}
          onChange={e => setNewQueries(e.target.value)}
          placeholder={
            'Add keywords (one per line):\nsite:linktr.ee "ffm.to"\nsite:linktr.ee "feature.fm" spotify'
          }
          rows={3}
          className='text-xs'
        />
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
    </section>
  );
}
