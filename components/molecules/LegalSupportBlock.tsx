import Link from 'next/link';
import { cn } from '@/lib/utils';

export interface LegalSupportBlockProps {
  title?: string;
  description: string;
  email: string;
}

export function LegalSupportBlock({
  title = 'Need a quick answer?',
  description,
  email,
}: LegalSupportBlockProps) {
  return (
    <div
      className={cn(
        'rounded-3xl border border-white/10 bg-gradient-to-br from-black/70 to-black/50 p-5',
        'text-sm text-white/70 shadow-[0_15px_40px_rgba(0,0,0,0.45)]'
      )}
    >
      <p className='text-xs uppercase tracking-[0.4em] text-white/60'>
        {title}
      </p>
      <p className='mt-3 text-base text-white/90'>{description}</p>
      <Link
        href={`mailto:${email}`}
        className='mt-5 inline-flex items-center gap-2 text-sm font-semibold text-blue-300 underline-offset-4 transition hover:text-white'
      >
        {email}
      </Link>
    </div>
  );
}
