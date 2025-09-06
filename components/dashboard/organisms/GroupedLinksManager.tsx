import React from 'react';
import { cn } from '@/lib/utils';
import type { DetectedLink } from '@/lib/utils/platform-detection';

export interface GroupedLinksManagerProps {
  initialLinks: DetectedLink[];
  className?: string;
}

// Server Component scaffold for a single, grouped Links Manager
// Phase 1: non-interactive layout + grouping only. Interaction wiring will follow.
export function GroupedLinksManager({
  initialLinks,
  className,
}: GroupedLinksManagerProps) {
  const groups = groupLinks(initialLinks);

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
    </section>
  );
}

function groupLinks(
  links: DetectedLink[]
): Record<'social' | 'dsp' | 'custom', DetectedLink[]> {
  const social: DetectedLink[] = [];
  const dsp: DetectedLink[] = [];
  const custom: DetectedLink[] = [];

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

  const byStable = (a: DetectedLink, b: DetectedLink) =>
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
