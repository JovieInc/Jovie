'use client';
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import React, { useEffect, useMemo, useState } from 'react';
import { UniversalLinkInput } from '@/components/dashboard/atoms/UniversalLinkInput';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import type { DetectedLink } from '@/lib/utils/platform-detection';

export interface GroupedLinksManagerProps<
  T extends DetectedLink = DetectedLink,
> {
  initialLinks: T[];
  className?: string;
  onLinksChange?: (links: T[]) => void;
  onLinkAdded?: (links: T[]) => void;
}

// Client Component scaffold for a single, grouped Links Manager
// Phase 2: wire minimal callbacks for DashboardLinks integration.
export function GroupedLinksManager<T extends DetectedLink = DetectedLink>({
  initialLinks,
  className,
  onLinksChange,
  onLinkAdded,
}: GroupedLinksManagerProps<T>) {
  const [links, setLinks] = useState<T[]>(() => [...initialLinks]);
  const [ytPrompt, setYtPrompt] = useState<{
    candidate: DetectedLink;
    target: 'social' | 'dsp';
  } | null>(null);

  const groups = useMemo(() => groupLinks(links), [links]);

  // Helper: visibility flag without using `any`
  const linkIsVisible = (l: T): boolean =>
    ((l as unknown as { isVisible?: boolean }).isVisible ?? true) !== false;

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  const idFor = (l: T) => `${l.platform.id}::${l.normalizedUrl}`;
  const mapIdToIndex = useMemo(() => {
    const m = new Map<string, number>();
    links.forEach((l, i) => m.set(`${l.platform.id}::${l.normalizedUrl}`, i));
    return m;
  }, [links]);

  const sectionOf = (l: T) =>
    (l.platform.category ?? 'custom') as 'social' | 'dsp' | 'custom';

  // Cross-category policy: which platforms can move between categories
  const CROSS_CATEGORY: Record<string, Array<'social' | 'dsp' | 'custom'>> = {
    // YouTube can be both a social profile (channel/handle) and a DSP (music)
    youtube: ['social', 'dsp'],
    // Add more platforms here if they legitimately span categories
    // soundcloud: ['social', 'dsp'],
  };

  const canMoveTo = (l: T, target: 'social' | 'dsp' | 'custom'): boolean => {
    const allowed =
      CROSS_CATEGORY[l.platform.id as keyof typeof CROSS_CATEGORY];
    if (!allowed) return false;
    return allowed.includes(target);
  };

  // Keep DashboardLinks in sync similar to the previous Unified manager
  useEffect(() => {
    onLinksChange?.(links);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links]);

  // Controls
  function handleAdd(link: DetectedLink) {
    // Enrich with visibility if missing
    const enriched = {
      isVisible: true,
      ...link,
    } as unknown as T;
    const section = sectionOf(enriched as T);
    const sameSectionHas = links.some(
      l => l.platform.id === enriched.platform.id && sectionOf(l) === section
    );
    const otherSection: 'social' | 'dsp' | null =
      section === 'social' ? 'dsp' : section === 'dsp' ? 'social' : null;
    const otherSectionHas = otherSection
      ? links.some(
          l =>
            l.platform.id === enriched.platform.id &&
            sectionOf(l) === otherSection
        )
      : false;

    // Allow YouTube to exist in both sections; dedupe within same section
    if (enriched.platform.id === 'youtube') {
      if (sameSectionHas && !otherSectionHas && otherSection) {
        // Prompt to add as the other category instead
        setYtPrompt({ candidate: enriched, target: otherSection });
        return;
      }
      if (sameSectionHas && otherSectionHas) {
        // Already exists in both sections; ignore duplicate add
        return;
      }
    } else {
      // For non-YouTube, block duplicate in same section
      if (sameSectionHas) return;
    }

    const next = [...links, enriched];
    setLinks(next);
    onLinkAdded?.([enriched as T]);
    onLinksChange?.(next);
  }

  function handleToggle(idx: number) {
    setLinks(prev => {
      const next = [...prev];
      const curr = next[idx] as unknown as { isVisible?: boolean };
      next[idx] = {
        ...next[idx],
        isVisible: !(curr?.isVisible ?? true),
      } as unknown as T;
      onLinksChange?.(next);
      return next;
    });
  }

  function handleRemove(idx: number) {
    setLinks(prev => {
      const next = prev.filter((_, i) => i !== idx);
      onLinksChange?.(next);
      return next;
    });
  }

  function onDragEnd(ev: DragEndEvent) {
    const { active, over } = ev;
    if (!over) return;
    if (active.id === over.id) return;

    const fromIdx = mapIdToIndex.get(String(active.id));
    const toIdx = mapIdToIndex.get(String(over.id));
    if (fromIdx == null || toIdx == null) return;

    // Allow reordering within the same section always
    const from = links[fromIdx];
    const to = links[toIdx];
    if (!from || !to) return;
    const fromSection = sectionOf(from);
    const toSection = sectionOf(to);

    if (fromSection === toSection) {
      const next = arrayMove(links, fromIdx, toIdx);
      setLinks(next);
      onLinksChange?.(next);
      return;
    }

    // Cross-section move: only if platform supports target section
    if (!canMoveTo(from, toSection)) return;

    const next = [...links];
    const updated = {
      ...from,
      platform: { ...from.platform, category: toSection },
    } as T;
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, updated);
    setLinks(next);
    onLinksChange?.(next);
  }

  return (
    <section className={cn('space-y-6', className)} aria-label='Links Manager'>
      {ytPrompt && (
        <div className='rounded-lg border border-subtle bg-surface-1 p-3 text-sm flex items-center justify-between gap-3'>
          <div className='text-primary-token'>
            You already added YouTube in this section. Do you also want to add
            it as a music service?
          </div>
          <div className='shrink-0 flex items-center gap-2'>
            <Button
              size='sm'
              variant='primary'
              onClick={() => {
                if (!ytPrompt) return;
                const adjusted = {
                  ...ytPrompt.candidate,
                  platform: {
                    ...ytPrompt.candidate.platform,
                    category: ytPrompt.target,
                  },
                } as unknown as T;
                const next = [...links, adjusted];
                setLinks(next);
                setYtPrompt(null);
                onLinkAdded?.([adjusted]);
                onLinksChange?.(next);
              }}
            >
              Add as {ytPrompt.target === 'dsp' ? 'Music' : 'Social'}
            </Button>
            <Button
              size='sm'
              variant='outline'
              onClick={() => setYtPrompt(null)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      {/* Add new link */}
      <UniversalLinkInput
        onAdd={handleAdd}
        // Avoid duplicate blocking for YouTube at input layer; we handle it here
        existingPlatforms={links
          .filter(l => l.platform.id !== 'youtube')
          .map(l => l.platform.id)}
        socialVisibleCount={
          links.filter(
            l => l.platform.category === 'social' && linkIsVisible(l)
          ).length
        }
        socialVisibleLimit={6}
      />

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        {(['social', 'dsp', 'custom'] as const).map(section => {
          const items = groups[section];
          return (
            <div key={section} className='space-y-3'>
              <header className='flex items-center justify-between'>
                <h2 className='text-sm font-semibold capitalize text-primary-token'>
                  {labelFor(section)}
                </h2>
                <span className='text-xs text-secondary-token'>
                  {items.length}
                </span>
              </header>
              <SortableContext items={items.map(idFor)}>
                <ul className='divide-y divide-subtle rounded-lg border border-subtle bg-surface-1'>
                  {items.map(link => (
                    <SortableRow
                      key={idFor(link as T)}
                      id={idFor(link as T)}
                      link={link as T}
                      index={links.findIndex(
                        l => l.normalizedUrl === link.normalizedUrl
                      )}
                      onToggle={handleToggle}
                      onRemove={handleRemove}
                      visible={linkIsVisible(link as T)}
                    />
                  ))}
                  {items.length === 0 && (
                    <li className='p-3 text-sm text-tertiary italic'>
                      No {labelFor(section)} links yet
                    </li>
                  )}
                </ul>
              </SortableContext>
            </div>
          );
        })}
      </DndContext>
    </section>
  );
}

function SortableRow<T extends DetectedLink>({
  id,
  link,
  index,
  onToggle,
  onRemove,
  visible,
}: {
  id: string;
  link: T;
  index: number;
  onToggle: (idx: number) => void;
  onRemove: (idx: number) => void;
  visible: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id });

  return (
    <li
      ref={setNodeRef}
      className='p-3 text-sm text-secondary-token flex items-center justify-between gap-3'
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      {...attributes}
      {...listeners}
    >
      <div className='min-w-0'>
        <div className='text-primary-token truncate'>{link.suggestedTitle}</div>
        <div className='text-xs text-tertiary truncate'>
          {link.normalizedUrl}
        </div>
      </div>
      <div className='shrink-0 flex items-center gap-2'>
        <Button
          size='sm'
          variant='secondary'
          onClick={() => onToggle(index)}
          aria-label={visible ? 'Hide link' : 'Show link'}
        >
          {visible ? 'Hide' : 'Show'}
        </Button>
        <Button
          size='sm'
          variant='outline'
          onClick={() => onRemove(index)}
          aria-label='Remove link'
        >
          Remove
        </Button>
      </div>
    </li>
  );
}

function groupLinks<T extends DetectedLink = DetectedLink>(
  links: T[]
): Record<'social' | 'dsp' | 'custom', T[]> {
  const social: T[] = [];
  const dsp: T[] = [];
  const custom: T[] = [];

  for (const l of links) {
    // Category comes from platform metadata; fallback to custom
    const category = (l.platform.category ?? 'custom') as
      | 'social'
      | 'dsp'
      | 'custom';
    if (category === 'social') social.push(l);
    else if (category === 'dsp') dsp.push(l);
    else custom.push(l);
  }

  const byStable = (a: T, b: T) =>
    (a.normalizedUrl || '').localeCompare(b.normalizedUrl || '');

  return {
    social: social.sort(byStable),
    dsp: dsp.sort(byStable),
    custom: custom.sort(byStable),
  };
}

function labelFor(section: 'social' | 'dsp' | 'custom'): string {
  switch (section) {
    case 'social':
      return 'Social';
    case 'dsp':
      return 'Music';
    default:
      return 'Custom';
  }
}
