'use client';
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

  const groups = useMemo(() => groupLinks(links), [links]);

  // Helper: visibility flag without using `any`
  const linkIsVisible = (l: T): boolean =>
    ((l as unknown as { isVisible?: boolean }).isVisible ?? true) !== false;

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

  return (
    <section className={cn('space-y-6', className)} aria-label='Links Manager'>
      {/* Add new link */}
      <UniversalLinkInput
        onAdd={handleAdd}
        existingPlatforms={links.map(l => l.platform.id)}
        socialVisibleCount={
          links.filter(
            l => l.platform.category === 'social' && linkIsVisible(l)
          ).length
        }
        socialVisibleLimit={6}
      />

      {(['social', 'dsp', 'custom'] as const).map(section => (
        <div key={section} className='space-y-3'>
          <header className='flex items-center justify-between'>
            <h2 className='text-sm font-semibold capitalize text-primary-token'>
              {labelFor(section)}
            </h2>
            <span className='text-xs text-secondary-token'>
              {groups[section].length}
            </span>
          </header>
          {/* Phase 1: placeholder list; wiring to existing LinkManager items in Phase 2 */}
          <ul className='divide-y divide-subtle rounded-lg border border-subtle bg-surface-1'>
            {groups[section].map(link => {
              const idx = links.findIndex(
                l => l.normalizedUrl === link.normalizedUrl
              );
              const visible = linkIsVisible(link as T);
              return (
                <li
                  key={`${link.platform.id}-${link.normalizedUrl}`}
                  className='p-3 text-sm text-secondary-token flex items-center justify-between gap-3'
                >
                  <div className='min-w-0'>
                    <div className='text-primary-token truncate'>
                      {link.suggestedTitle}
                    </div>
                    <div className='text-xs text-tertiary truncate'>
                      {link.normalizedUrl}
                    </div>
                  </div>
                  <div className='shrink-0 flex items-center gap-2'>
                    <Button
                      size='sm'
                      variant='secondary'
                      onClick={() => handleToggle(idx)}
                      aria-label={visible ? 'Hide link' : 'Show link'}
                    >
                      {visible ? 'Hide' : 'Show'}
                    </Button>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => handleRemove(idx)}
                      aria-label='Remove link'
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              );
            })}
            {groups[section].length === 0 && (
              <li className='p-3 text-sm text-tertiary italic'>
                No {labelFor(section)} links yet
              </li>
            )}
          </ul>
        </div>
      ))}
    </section>
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
