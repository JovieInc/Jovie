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
import { getPlatformIcon, SocialIcon } from '@/components/atoms/SocialIcon';
import { Tooltip } from '@/components/atoms/Tooltip';
import { UniversalLinkInput } from '@/components/dashboard/atoms/UniversalLinkInput';
import { Button } from '@/components/ui/Button';
import { popularityIndex } from '@/constants/app';
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
  const [collapsed, setCollapsed] = useState<
    Record<'social' | 'dsp' | 'earnings' | 'custom', boolean>
  >({ social: false, dsp: false, earnings: false, custom: false });
  const [collapsedInitialized, setCollapsedInitialized] = useState(false);
  const [tippingEnabled, setTippingEnabled] = useState<boolean>(false);
  const [tippingJustEnabled, setTippingJustEnabled] = useState<boolean>(false);
  const [ytPrompt, setYtPrompt] = useState<{
    candidate: DetectedLink;
    target: 'social' | 'dsp';
  } | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const groups = useMemo(() => groupLinks(links), [links]);

  // Helper: visibility flag without using `any`
  const linkIsVisible = (l: T): boolean =>
    ((l as unknown as { isVisible?: boolean }).isVisible ?? true) !== false;

  // Initialize and dynamically update collapsed state for empty sections.
  // Also flash the Earnings badge briefly the first time it becomes enabled.
  useEffect(() => {
    if (!collapsedInitialized) {
      setCollapsed({
        social: groups.social.length === 0,
        dsp: groups.dsp.length === 0,
        earnings: groups.earnings.length === 0,
        custom: groups.custom.length === 0,
      });
      setCollapsedInitialized(true);
    } else {
      // Force-collapse any section that becomes empty; preserve manual user state otherwise
      setCollapsed(prev => ({
        social: groups.social.length === 0 ? true : prev.social,
        dsp: groups.dsp.length === 0 ? true : prev.dsp,
        earnings: groups.earnings.length === 0 ? true : prev.earnings,
        custom: groups.custom.length === 0 ? true : prev.custom,
      }));
    }

    const enabled = groups.earnings.length > 0;
    if (enabled && !tippingEnabled) {
      setTippingJustEnabled(true);
      window.setTimeout(() => setTippingJustEnabled(false), 1500);
    }
    setTippingEnabled(enabled);
  }, [groups, collapsedInitialized, tippingEnabled]);

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
    (l.platform.category ?? 'custom') as
      | 'social'
      | 'dsp'
      | 'earnings'
      | 'custom';

  // Cross-category policy (platforms that can live in multiple sections)
  const CROSS_CATEGORY: Record<string, Array<'social' | 'dsp' | 'custom'>> = {
    youtube: ['social', 'dsp'],
    // soundcloud: ['social', 'dsp'], // enable if desired
  };

  const canMoveTo = (
    l: T,
    target: 'social' | 'dsp' | 'custom' | 'earnings'
  ): boolean => {
    if (target === 'earnings') return false; // earnings are not cross-movable
    const allowed =
      CROSS_CATEGORY[l.platform.id as keyof typeof CROSS_CATEGORY];
    if (!allowed) return false;
    return allowed.includes(target as 'social' | 'dsp' | 'custom');
  };

  // Keep DashboardLinks in sync similar to the previous Unified manager
  useEffect(() => {
    onLinksChange?.(links);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links]);

  // Controls
  async function handleAdd(link: DetectedLink) {
    // Enrich with visibility if missing
    const enriched = {
      isVisible: true,
      ...link,
    } as unknown as T;
    // Normalize venmo into Earnings category for dashboard grouping
    if ((enriched as DetectedLink).platform.id === 'venmo') {
      (enriched as DetectedLink).platform = {
        ...(enriched as DetectedLink).platform,
        category: 'earnings' as unknown as 'social',
      } as DetectedLink['platform'];
    }
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

    // Best-effort server notification: enable tipping when Venmo is added
    try {
      if ((enriched as DetectedLink).platform.id === 'venmo') {
        void fetch('/api/dashboard/tipping/enable', { method: 'POST' });
      }
    } catch {
      // non-blocking
    }
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
    if (!canMoveTo(from, toSection)) {
      // Gentle hint: Only some platforms can move across sections
      const platformName = from.platform.name || from.platform.id;
      const targetLabel = labelFor(toSection);
      setHint(
        `${platformName} can’t be moved to ${targetLabel}. Only certain platforms (e.g., YouTube) can live in multiple sections.`
      );
      // Auto-hide after 2.4s
      window.setTimeout(() => setHint(null), 2400);
      return;
    }

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
      {hint && (
        <div
          className='rounded-lg border border-amber-300/40 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200 px-3 py-2 text-sm'
          role='status'
          aria-live='polite'
        >
          {hint}
        </div>
      )}
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
        {(['social', 'dsp', 'earnings', 'custom'] as const).map(section => {
          const items = [...groups[section]].sort(
            (a, b) =>
              popularityIndex(a.platform.id) - popularityIndex(b.platform.id)
          );
          return (
            <div key={section} className='space-y-3'>
              <header className='flex items-center justify-between'>
                <button
                  type='button'
                  className='flex items-center gap-2 text-sm font-semibold capitalize text-primary-token'
                  onClick={() =>
                    setCollapsed(prev => ({
                      ...prev,
                      [section]: !prev[section],
                    }))
                  }
                  aria-expanded={!collapsed[section]}
                  aria-controls={`links-section-${section}`}
                >
                  <svg
                    className={cn(
                      'h-4 w-4 transition-transform',
                      collapsed[section] ? '-rotate-90' : 'rotate-0'
                    )}
                    viewBox='0 0 20 20'
                    aria-hidden='true'
                  >
                    <path
                      d='M6 8l4 4 4-4'
                      stroke='currentColor'
                      strokeWidth='2'
                      fill='none'
                      strokeLinecap='round'
                      strokeLinejoin='round'
                    />
                  </svg>
                  {labelFor(section)}
                  {section === 'earnings' && tippingEnabled && (
                    <span
                      className={cn(
                        'ml-2 inline-flex items-center rounded-full bg-green-500/15 text-green-600 dark:text-green-400 px-2 py-0.5 text-[10px] font-medium ring-1 ring-green-500/25',
                        tippingJustEnabled && 'animate-pulse'
                      )}
                    >
                      Tipping enabled
                    </span>
                  )}
                </button>
                <div className='flex items-center gap-2'>
                  <Tooltip
                    content={
                      'Links are ordered automatically based on popularity. Some links (like YouTube) can appear in both Music & Social.'
                    }
                    placement='top'
                  >
                    <span className='inline-flex h-5 w-5 items-center justify-center rounded-md text-tertiary hover:text-secondary ring-1 ring-transparent hover:ring-subtle cursor-help'>
                      <svg
                        viewBox='0 0 20 20'
                        className='h-3.5 w-3.5'
                        aria-hidden='true'
                      >
                        <path
                          d='M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm-.75-4.5h1.5v-1.2c0-.62.32-.96 1.02-1.3.94-.45 1.48-1.13 1.48-2.13 0-1.7-1.38-2.87-3.25-2.87-1.7 0-3 .9-3.33 2.35l1.45.38c.17-.74.82-1.2 1.83-1.2 1 0 1.7.56 1.7 1.34 0 .58-.25.89-.97 1.23-.98.46-1.43 1.07-1.43 2.1v1.5Zm0 2.25h1.5v-1.5h-1.5v1.5Z'
                          fill='currentColor'
                        />
                      </svg>
                    </span>
                  </Tooltip>
                  <span className='text-xs text-secondary-token'>
                    {items.length}
                  </span>
                </div>
              </header>
              <SortableContext items={items.map(idFor)}>
                <ul
                  id={`links-section-${section}`}
                  className={cn(
                    'divide-y divide-subtle rounded-lg border border-subtle bg-surface-1',
                    collapsed[section] && 'hidden'
                  )}
                >
                  {items.map(link => (
                    <SortableRow
                      key={idFor(link as T)}
                      id={idFor(link as T)}
                      link={link as T}
                      index={links.findIndex(
                        l => l.normalizedUrl === link.normalizedUrl
                      )}
                      draggable={section !== 'earnings'}
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
  draggable = true,
}: {
  id: string;
  link: T;
  index: number;
  onToggle: (idx: number) => void;
  onRemove: (idx: number) => void;
  visible: boolean;
  draggable?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id, disabled: !draggable });
  const [isDarkTheme, setIsDarkTheme] = React.useState(false);
  React.useEffect(() => {
    const root = document.documentElement;
    const update = () => setIsDarkTheme(root.classList.contains('dark'));
    update();
    const mo = new MutationObserver(update);
    mo.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);

  // Brand color utilities (mirrors UniversalLinkInput heuristics)
  const hexToRgb = (hex: string) => {
    const h = hex.replace('#', '');
    const bigint = parseInt(h, 16);
    return {
      r: (bigint >> 16) & 255,
      g: (bigint >> 8) & 255,
      b: bigint & 255,
    };
  };
  const relativeLuminance = (hex: string) => {
    const { r, g, b } = hexToRgb(hex);
    const [R, G, B] = [r, g, b].map(v => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * R + 0.7152 * G + 0.0722 * B;
  };
  const iconMeta = getPlatformIcon(link.platform.icon);
  const brandHex = iconMeta?.hex ? `#${iconMeta.hex}` : '#6b7280';
  const brandIsDark = relativeLuminance(brandHex) < 0.35;
  // In dark theme, invert very dark brands (e.g., X, TikTok) to white for legibility
  const iconColor = isDarkTheme && brandIsDark ? '#ffffff' : brandHex;
  const iconBg = isDarkTheme
    ? brandIsDark
      ? 'rgba(255,255,255,0.08)'
      : `${brandHex}20`
    : `${brandHex}15`;

  return (
    <li
      ref={setNodeRef}
      className='p-3 text-sm text-secondary-token flex items-center justify-between gap-3'
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      {...attributes}
    >
      <div className='min-w-0 flex items-start gap-3'>
        {/* Drag handle */}
        {draggable && (
          <button
            type='button'
            className='mt-0.5 h-7 w-4 shrink-0 cursor-grab text-tertiary hover:text-secondary focus-visible:outline-none'
            aria-label='Drag handle'
            {...listeners}
          >
            <svg viewBox='0 0 20 20' className='h-4 w-4' aria-hidden='true'>
              <circle cx='6' cy='6' r='1.5' />
              <circle cx='6' cy='14' r='1.5' />
              <circle cx='14' cy='6' r='1.5' />
              <circle cx='14' cy='14' r='1.5' />
            </svg>
          </button>
        )}
        <div
          className='flex items-center justify-center w-7 h-7 rounded-lg shrink-0 mt-0.5 transition-all hover:scale-[1.04] hover:ring-1 hover:ring-subtle'
          style={{ backgroundColor: iconBg, color: iconColor }}
          aria-hidden='true'
        >
          <SocialIcon platform={link.platform.icon} className='w-4 h-4' />
        </div>
        <div className='min-w-0'>
          <div className='text-primary-token truncate'>
            {link.suggestedTitle}
          </div>
          <div className='text-xs text-tertiary truncate'>
            {link.normalizedUrl}
          </div>
        </div>
      </div>
      <div className='shrink-0 flex items-center gap-2'>
        <Tooltip content={visible ? 'Hide link' : 'Show link'} placement='top'>
          <Button
            size='sm'
            variant='ghost'
            className='px-2 py-1 text-[11px] rounded-md'
            onClick={() => onToggle(index)}
            aria-label={visible ? 'Hide link' : 'Show link'}
          >
            {visible ? 'Hide' : 'Show'}
          </Button>
        </Tooltip>
        <Tooltip content='Remove link' placement='top'>
          <Button
            size='sm'
            variant='plain'
            className='px-2 py-1 text-[11px] text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 rounded-md'
            onClick={() => onRemove(index)}
            aria-label='Remove link'
          >
            Remove
          </Button>
        </Tooltip>
      </div>
    </li>
  );
}

function groupLinks<T extends DetectedLink = DetectedLink>(
  links: T[]
): Record<'social' | 'dsp' | 'earnings' | 'custom', T[]> {
  const social: T[] = [];
  const dsp: T[] = [];
  const earnings: T[] = [];
  const custom: T[] = [];

  for (const l of links) {
    // Category comes from platform metadata; fallback to custom
    const category = (l.platform.category ?? 'custom') as
      | 'social'
      | 'dsp'
      | 'earnings'
      | 'custom';
    if (category === 'social') social.push(l);
    else if (category === 'dsp') dsp.push(l);
    else if (category === 'earnings') earnings.push(l);
    else custom.push(l);
  }

  const byStable = (a: T, b: T) =>
    (a.normalizedUrl || '').localeCompare(b.normalizedUrl || '');

  return {
    social: social.sort(byStable),
    dsp: dsp.sort(byStable),
    earnings: earnings.sort(byStable),
    custom: custom.sort(byStable),
  };
}

function labelFor(section: 'social' | 'dsp' | 'earnings' | 'custom'): string {
  switch (section) {
    case 'social':
      return 'Social';
    case 'dsp':
      return 'Music';
    case 'earnings':
      return 'Earnings';
    default:
      return 'Custom';
  }
}
