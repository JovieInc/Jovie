import { SectionHeading } from '@/components/atoms/SectionHeading';
import { cn } from '@/lib/utils';

export interface LegalHeroProps {
  eyebrow: string;
  title: string;
  description: string;
  highlight?: string;
}

export function LegalHero({
  eyebrow,
  title,
  description,
  highlight,
}: LegalHeroProps) {
  return (
    <section
      className={cn(
        'rounded-3xl border border-white/20 bg-gradient-to-br from-black/70 to-[#13151B] p-8 shadow-[0_30px_60px_rgba(0,0,0,0.45)]',
        'backdrop-blur-sm'
      )}
    >
      <p className='text-xs uppercase tracking-[0.5em] text-white/60'>
        {eyebrow}
      </p>
      <SectionHeading
        level={1}
        size='xl'
        align='left'
        className='!text-white mt-3'
      >
        {title}
      </SectionHeading>
      <p className='mt-4 text-base text-white/80 leading-relaxed'>
        {description}
      </p>
      {highlight && (
        <div className='mt-6 inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-1 text-sm font-medium text-white/80'>
          <span className='text-slate-200'>#</span>
          <span>{highlight}</span>
        </div>
      )}
    </section>
  );
}
