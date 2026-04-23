'use client';

import { Button } from '@jovie/ui';
import { useCallback, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { addCatalogTaskToRelease } from '@/app/app/(shell)/dashboard/releases/catalog-task-actions';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/organisms/Dialog';
import { captureError } from '@/lib/error-tracking';
import { cn } from '@/lib/utils';

export type CatalogBrowserRow = {
  readonly slug: string;
  readonly name: string;
  readonly shortDescription: string | null;
  readonly clusterId: number | null;
  readonly category: string;
};

export type CatalogBrowserCluster = {
  readonly id: number;
  readonly slug: string;
  readonly displayName: string;
};

interface CatalogTaskBuilderDialogProps {
  readonly open: boolean;
  readonly releaseId: string;
  readonly catalog: readonly CatalogBrowserRow[];
  readonly clusters: readonly CatalogBrowserCluster[];
  readonly alreadyAddedSlugs: readonly string[];
  readonly onClose: () => void;
  readonly onAdded?: () => void;
  readonly addAction?: (releaseId: string, slug: string) => Promise<unknown>;
}

export function CatalogTaskBuilderDialog({
  open,
  releaseId,
  catalog,
  clusters,
  alreadyAddedSlugs,
  onClose,
  onAdded,
  addAction,
}: CatalogTaskBuilderDialogProps) {
  const [query, setQuery] = useState('');
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const [optimisticAddedSlugs, setOptimisticAddedSlugs] = useState<
    readonly string[]
  >([]);
  const [, startTransition] = useTransition();
  const addedSet = useMemo(
    () => new Set([...alreadyAddedSlugs, ...optimisticAddedSlugs]),
    [alreadyAddedSlugs, optimisticAddedSlugs]
  );

  const clustersById = useMemo(() => {
    const m = new Map<number, CatalogBrowserCluster>();
    for (const c of clusters) m.set(c.id, c);
    return m;
  }, [clusters]);

  const filtered = useMemo(() => {
    if (!query.trim()) return catalog;
    const q = query.toLowerCase();
    return catalog.filter(row => {
      return (
        row.name.toLowerCase().includes(q) ||
        (row.shortDescription ?? '').toLowerCase().includes(q)
      );
    });
  }, [catalog, query]);

  const grouped = useMemo(() => {
    const groups = new Map<number | null, CatalogBrowserRow[]>();
    for (const row of filtered) {
      const key = row.clusterId;
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }
    return Array.from(groups.entries()).sort((a, b) => {
      const aOrder = a[0] === null ? Infinity : a[0];
      const bOrder = b[0] === null ? Infinity : b[0];
      return aOrder - bOrder;
    });
  }, [filtered]);

  const action = addAction ?? addCatalogTaskToRelease;

  const handleAdd = useCallback(
    async (slug: string) => {
      if (pendingSlug) return;
      setPendingSlug(slug);
      try {
        await action(releaseId, slug);
        setOptimisticAddedSlugs(prev =>
          prev.includes(slug) ? prev : [...prev, slug]
        );
        onAdded?.();
        toast.success('Task added from catalog.');
      } catch (error) {
        captureError('Failed to add catalog task', error, {
          context: 'catalog-task-builder-dialog',
          releaseId,
          slug,
        });
        toast.error('Could not add that task. Try again.');
      } finally {
        setPendingSlug(null);
      }
    },
    [action, onAdded, pendingSlug, releaseId]
  );

  return (
    <Dialog open={open} onClose={onClose} size='2xl'>
      <DialogTitle>Add from catalog</DialogTitle>
      <DialogDescription>
        Browse the canonical release-task catalog and add anything the wizard
        did not pick.
      </DialogDescription>
      <DialogBody>
        <div className='space-y-3'>
          <input
            type='search'
            value={query}
            onChange={e => startTransition(() => setQuery(e.target.value))}
            placeholder='Search tasks'
            aria-label='Search tasks'
            data-testid='catalog-search'
            className='w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm'
          />
          <div
            className='max-h-[60vh] overflow-y-auto space-y-4'
            data-testid='catalog-list'
          >
            {grouped.length === 0 ? (
              <div className='text-sm text-muted-foreground px-2 py-6 text-center'>
                No catalog tasks match that search.
              </div>
            ) : (
              grouped.map(([clusterId, rows]) => {
                const cluster =
                  clusterId !== null ? clustersById.get(clusterId) : null;
                const heading = cluster?.displayName ?? 'Uncategorized';
                return (
                  <div key={String(clusterId ?? 'null')}>
                    <div className='text-xs uppercase tracking-wide text-muted-foreground mb-1.5'>
                      {heading}
                    </div>
                    <ul className='space-y-1'>
                      {rows.map(row => {
                        const isAdded = addedSet.has(row.slug);
                        const isPending = pendingSlug === row.slug;
                        return (
                          <li
                            key={row.slug}
                            data-testid={`catalog-row-${row.slug}`}
                            className={cn(
                              'flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2'
                            )}
                          >
                            <div className='min-w-0 flex-1'>
                              <div className='text-sm font-medium truncate'>
                                {row.name}
                              </div>
                              {row.shortDescription ? (
                                <div className='text-xs text-muted-foreground truncate'>
                                  {row.shortDescription}
                                </div>
                              ) : null}
                            </div>
                            <Button
                              type='button'
                              size='sm'
                              variant={isAdded ? 'secondary' : 'primary'}
                              disabled={isAdded || isPending}
                              onClick={() => handleAdd(row.slug)}
                              data-testid={`catalog-add-${row.slug}`}
                            >
                              {isAdded
                                ? 'Added'
                                : isPending
                                  ? 'Adding...'
                                  : 'Add'}
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </DialogBody>
      <DialogActions>
        <Button type='button' size='sm' variant='secondary' onClick={onClose}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}
