'use client';

import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  useReleaseSkillClustersQuery,
  useReleaseTaskCatalogQuery,
} from '@/lib/queries/useReleaseCatalogQuery';
import {
  useInstantiateTasksMutation,
  useTaskToggleMutation,
} from '@/lib/queries/useReleaseTaskMutations';
import { useReleaseTasksQuery } from '@/lib/queries/useReleaseTasksQuery';
import type { ReleaseTaskView } from '@/lib/release-tasks/types';
import { cn } from '@/lib/utils';
import { toDateOnlySafe } from '@/lib/utils/date';
import { ClusterFilterChips } from './ClusterFilterChips';
import { ReleaseTaskCategoryGroup } from './ReleaseTaskCategoryGroup';
import { ReleaseTaskCompactRow } from './ReleaseTaskCompactRow';
import { ReleaseTaskEmptyState } from './ReleaseTaskEmptyState';
import { ReleaseTaskPastReleaseState } from './ReleaseTaskPastReleaseState';
import { ReleaseTaskProgressBar } from './ReleaseTaskProgressBar';
import { ReleaseTaskRow } from './ReleaseTaskRow';

const CatalogTaskBuilderDialog = lazy(() =>
  import('./CatalogTaskBuilderDialog').then(m => ({
    default: m.CatalogTaskBuilderDialog,
  }))
);

function readTaskMetadataSlug(
  metadata: Record<string, unknown> | null
): string | null {
  const v = metadata?.catalogSlug;
  return typeof v === 'string' ? v : null;
}

const DAY_MS = 1000 * 60 * 60 * 24;

interface ReleaseTaskChecklistProps {
  readonly releaseId: string;
  readonly variant: 'compact' | 'full';
  readonly releaseDate?: Date | string | null;
  readonly onNavigateToTask?: (taskId: string) => void;
  readonly onNavigateToFullPage?: () => void;
}

function groupByCategory(tasks: ReleaseTaskView[]) {
  const groups = new Map<
    string,
    { tasks: ReleaseTaskView[]; done: number; total: number }
  >();

  for (const task of tasks) {
    const cat = task.category ?? 'Other';
    const group = groups.get(cat) ?? { tasks: [], done: 0, total: 0 };
    group.tasks.push(task);
    group.total++;
    if (task.status === 'done') group.done++;
    groups.set(cat, group);
  }

  return groups;
}

function parseCalendarDate(value: Date | string): Date {
  const [year, month, day] = toDateOnlySafe(value).split('-').map(Number);
  return new Date(year, month - 1, day);
}

function getRelativeDueDays(dueDate: Date | string): number {
  const due = parseCalendarDate(dueDate);
  return Math.ceil((due.getTime() - Date.now()) / DAY_MS);
}

function isPastRelease(releaseDate?: Date | string | null): boolean {
  if (!releaseDate) return false;
  return getRelativeDueDays(releaseDate) < 0;
}

export function ReleaseTaskChecklist({
  releaseId,
  variant,
  releaseDate,
  onNavigateToTask,
  onNavigateToFullPage,
}: ReleaseTaskChecklistProps) {
  const isCompact = variant === 'compact';
  const { data: tasks, isLoading } = useReleaseTasksQuery(releaseId);
  const instantiate = useInstantiateTasksMutation(releaseId);
  const toggle = useTaskToggleMutation(releaseId);

  // Track whether we just generated tasks (empty → populated transition)
  const wasEmpty = useRef(!tasks || tasks.length === 0);
  const [animateEntrance, setAnimateEntrance] = useState(false);
  const prevReleaseId = useRef(releaseId);

  // Reset animation tracking when switching releases
  useEffect(() => {
    if (prevReleaseId.current !== releaseId) {
      prevReleaseId.current = releaseId;
      wasEmpty.current = true;
      setAnimateEntrance(false);
    }
  }, [releaseId]);

  useEffect(() => {
    if (tasks && tasks.length > 0 && wasEmpty.current) {
      wasEmpty.current = false;
      setAnimateEntrance(true);
      const timeout = setTimeout(() => setAnimateEntrance(false), 3000);
      return () => clearTimeout(timeout);
    }
    if (!tasks || tasks.length === 0) {
      wasEmpty.current = true;
    }
  }, [tasks]);

  const [selectedClusterSlugs, setSelectedClusterSlugs] = useState<
    readonly string[]
  >([]);
  const [catalogDialogOpen, setCatalogDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  const { data: clustersData } = useReleaseSkillClustersQuery();
  const { data: catalogData } = useReleaseTaskCatalogQuery();

  const catalogSlugToClusterId = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const row of catalogData ?? []) m.set(row.slug, row.clusterId ?? null);
    return m;
  }, [catalogData]);

  const clusterSlugToId = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of clustersData ?? []) m.set(c.slug, c.id);
    return m;
  }, [clustersData]);

  const filteredTasks = useMemo(() => {
    if (!tasks) return tasks;
    if (selectedClusterSlugs.length === 0) return tasks;
    const wantedClusterIds = new Set(
      selectedClusterSlugs
        .map(s => clusterSlugToId.get(s))
        .filter((v): v is number => typeof v === 'number')
    );
    return tasks.filter(task => {
      const slug = readTaskMetadataSlug(task.metadata);
      if (!slug) return true;
      const cid = catalogSlugToClusterId.get(slug) ?? null;
      return cid !== null && wantedClusterIds.has(cid);
    });
  }, [tasks, selectedClusterSlugs, clusterSlugToId, catalogSlugToClusterId]);

  const alreadyAddedSlugs = useMemo(() => {
    if (!tasks) return [] as string[];
    const out: string[] = [];
    for (const t of tasks) {
      const s = readTaskMetadataSlug(t.metadata);
      if (s) out.push(s);
    }
    return out;
  }, [tasks]);

  const groups = useMemo(
    () => (filteredTasks ? groupByCategory(filteredTasks) : new Map()),
    [filteredTasks]
  );

  const totalDone = tasks?.filter(t => t.status === 'done').length ?? 0;
  const totalTasks = tasks?.length ?? 0;
  const overdueCount = useMemo(() => {
    if (!tasks) return 0;
    return tasks.filter(
      t =>
        t.status !== 'done' &&
        t.status !== 'cancelled' &&
        t.dueDate &&
        getRelativeDueDays(t.dueDate) < 0
    ).length;
  }, [tasks]);

  const handleToggle = (taskId: string, done: boolean) => {
    toggle.mutate({ taskId, done });
  };

  // Loading state
  if (isLoading) {
    return (
      <div className='space-y-2 px-3 py-2'>
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div
            key={i}
            className='h-8 animate-pulse rounded bg-surface-1'
            style={{ opacity: 1 - i * 0.12 }}
          />
        ))}
      </div>
    );
  }

  // Empty state
  if (!tasks || tasks.length === 0) {
    return (
      <div
        className={variant === 'compact' ? 'px-2 py-2' : ''}
        data-testid={
          variant === 'compact'
            ? 'release-task-empty-state-compact'
            : 'release-task-empty-state'
        }
      >
        {isPastRelease(releaseDate) ? (
          <ReleaseTaskPastReleaseState
            onSetUpAnyway={() => instantiate.mutate()}
            isLoading={instantiate.isPending}
          />
        ) : (
          <ReleaseTaskEmptyState
            onSetUp={() => instantiate.mutate()}
            isLoading={instantiate.isPending}
          />
        )}
      </div>
    );
  }

  const groupEntries = Array.from(groups.entries());

  return (
    <div
      className={cn(
        'space-y-1',
        isCompact && 'flex h-full min-h-0 flex-col space-y-0'
      )}
      data-testid={isCompact ? undefined : 'release-task-checklist'}
    >
      {/* Progress bar + optional link to full page */}
      <motion.div
        className='flex shrink-0 items-center gap-2 px-4 py-2'
        initial={animateEntrance ? { opacity: 0, y: -8 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <ReleaseTaskProgressBar
          done={totalDone}
          total={totalTasks}
          overdueCount={overdueCount}
          className='flex-1'
        />
        {!isCompact && (clustersData?.length ?? 0) > 0 && (
          <button
            type='button'
            onClick={() => setCatalogDialogOpen(true)}
            className='flex-shrink-0 text-xs text-muted-foreground hover:text-foreground'
            data-testid='open-catalog-builder'
          >
            Add from catalog
          </button>
        )}
        {variant === 'compact' && onNavigateToFullPage && (
          <button
            type='button'
            onClick={onNavigateToFullPage}
            className='flex-shrink-0 text-3xs text-[var(--linear-accent,#5e6ad2)] hover:underline'
          >
            Open &rarr;
          </button>
        )}
      </motion.div>

      {!isCompact && (clustersData?.length ?? 0) > 0 && (
        <ClusterFilterChips
          clusters={clustersData ?? []}
          selectedSlugs={selectedClusterSlugs}
          onChange={setSelectedClusterSlugs}
        />
      )}

      {!isCompact && catalogDialogOpen && (
        <Suspense fallback={null}>
          <CatalogTaskBuilderDialog
            open
            releaseId={releaseId}
            catalog={catalogData ?? []}
            clusters={clustersData ?? []}
            alreadyAddedSlugs={alreadyAddedSlugs}
            onClose={() => setCatalogDialogOpen(false)}
            onAdded={() =>
              queryClient.invalidateQueries({
                queryKey: ['release-tasks', releaseId],
              })
            }
          />
        </Suspense>
      )}

      {/* Category groups */}
      <div
        className={cn('space-y-3', isCompact && 'min-h-0 overflow-y-auto')}
        data-testid={
          isCompact ? 'release-task-checklist-scroll-region' : undefined
        }
        data-scroll-mode={isCompact ? 'internal' : undefined}
      >
        {groupEntries.map(([category, group], groupIndex) => {
          // Each group appears with a base delay proportional to its position
          const groupDelay = animateEntrance ? groupIndex * 0.15 : 0;

          return (
            <motion.div
              key={category}
              initial={animateEntrance ? { opacity: 0, y: 12 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.25,
                delay: groupDelay,
                ease: 'easeOut',
              }}
            >
              <ReleaseTaskCategoryGroup
                category={category}
                done={group.done}
                total={group.total}
                allDone={group.done === group.total}
              >
                {group.tasks.map((task: ReleaseTaskView, taskIndex: number) => {
                  const taskDelay = animateEntrance
                    ? groupDelay + 0.08 + taskIndex * 0.04
                    : 0;

                  return (
                    <motion.div
                      key={task.id}
                      initial={
                        animateEntrance
                          ? { opacity: 0, x: -16, filter: 'blur(4px)' }
                          : false
                      }
                      animate={{
                        opacity: 1,
                        x: 0,
                        ...(animateEntrance && { filter: 'blur(0px)' }),
                      }}
                      transition={{
                        duration: 0.25,
                        delay: taskDelay,
                        ease: 'easeOut',
                      }}
                    >
                      {variant === 'compact' ? (
                        <ReleaseTaskCompactRow
                          task={task}
                          onToggle={handleToggle}
                          onNavigate={onNavigateToTask ?? (() => {})}
                        />
                      ) : (
                        <ReleaseTaskRow task={task} onToggle={handleToggle} />
                      )}
                    </motion.div>
                  );
                })}
              </ReleaseTaskCategoryGroup>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
