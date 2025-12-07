import Link from 'next/link';
import { TocEntry } from '@/lib/legal/getLegalDocument';
import { cn } from '@/lib/utils';

export interface LegalSidebarProps {
  toc: TocEntry[];
  className?: string;
}

export function LegalSidebar({ toc, className }: LegalSidebarProps) {
  if (!toc.length) {
    return null;
  }

  return (
    <nav
      aria-label='Document navigation'
      className={cn('space-y-1', className)}
    >
      <p className='text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-3 px-3'>
        On this page
      </p>
      {toc.map(entry => (
        <Link
          key={entry.id}
          href={`#${entry.id}`}
          className={cn(
            'block px-3 py-1.5 text-sm rounded-md transition-colors',
            'text-neutral-600 dark:text-neutral-400',
            'hover:text-neutral-900 dark:hover:text-white',
            'hover:bg-neutral-100 dark:hover:bg-white/5'
          )}
        >
          {entry.title}
        </Link>
      ))}
    </nav>
  );
}
