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
      className={cn(
        'space-y-3 rounded-3xl border border-white/15 bg-white/5 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.35)]',
        className
      )}
    >
      <div className='flex items-center justify-between'>
        <span className='text-xs font-semibold tracking-[0.4em] text-white/60'>
          Jump
        </span>
        <span className='rounded-full border border-white/20 px-3 py-1 text-[11px] uppercase tracking-[0.3em] text-white/40'>
          #sections
        </span>
      </div>
      <div className='space-y-2'>
        {toc.map((entry, index) => (
          <Link
            key={entry.id}
            href={`#${entry.id}`}
            className='group flex items-start gap-3 rounded-2xl p-2 text-white/70 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400'
          >
            <span className='text-sm font-mono uppercase tracking-[0.25em] text-blue-300'>
              #{String(index + 1).padStart(2, '0')}
            </span>
            <div>
              <p className='text-sm font-semibold leading-tight text-white transition group-hover:text-white'>
                {entry.title}
              </p>
              <p className='text-[11px] uppercase tracking-[0.3em] text-white/40'>
                Section {entry.level}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </nav>
  );
}
