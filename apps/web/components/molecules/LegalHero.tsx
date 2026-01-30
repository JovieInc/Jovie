export interface LegalHeroProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly highlight?: string;
}

export function LegalHero({
  eyebrow,
  title,
  description,
  highlight,
}: LegalHeroProps) {
  return (
    <header className='max-w-2xl'>
      <p className='text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-3'>
        {eyebrow}
      </p>
      <h1 className='text-3xl font-semibold tracking-tight text-neutral-900 dark:text-white sm:text-4xl'>
        {title}
      </h1>
      <p className='mt-4 text-base text-neutral-600 dark:text-neutral-400 leading-relaxed'>
        {description}
      </p>
      {highlight && (
        <div className='mt-6 inline-flex items-center gap-2 px-3 py-1 text-xs font-medium rounded-full bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300 border border-neutral-200/50 dark:border-white/10'>
          {highlight}
        </div>
      )}
    </header>
  );
}
