'use client';
import React, { useEffect } from 'react';
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
  const groups = groupLinks(initialLinks);

  // Keep DashboardLinks in sync similar to the previous Unified manager
  useEffect(() => {
    onLinksChange?.(initialLinks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLinks]);

  // Placeholder to satisfy lint until we add add/remove controls
  void onLinkAdded;

  return (
    <section className={cn('space-y-6', className)} aria-label='Links Manager'>
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
            {groups[section].map(link => (
              <li
                key={link.normalizedUrl}
                className='p-3 text-sm text-secondary-token'
              >
                {link.suggestedTitle} —{' '}
                <span className='font-mono'>{link.normalizedUrl}</span>
              </li>
            ))}
            {groups[section].length === 0 && (
              <li className='p-3 text-sm text-tertiary italic'>
                No {labelFor(section)} links yet
              </li>
            )}
          </ul>
        </div>
      ))}
      {/* Placeholder: when we add add/remove controls, we'll call onLinkAdded */}
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
