export interface LegalHeroProps {
  readonly title: string;
  readonly lastUpdated: string;
  readonly practicalSummary: string;
}

export function LegalHero({
  title,
  lastUpdated,
  practicalSummary,
}: LegalHeroProps) {
  return (
    <header className='max-w-3xl border-b border-neutral-200 pb-8 dark:border-white/10'>
      <h1 className='text-3xl font-semibold text-neutral-950 dark:text-white sm:text-4xl'>
        {title}
      </h1>
      {lastUpdated ? (
        <p className='mt-3 text-sm text-neutral-500 dark:text-neutral-400'>
          Last updated: {lastUpdated}
        </p>
      ) : null}
      <p className='mt-6 max-w-2xl text-[15px] leading-7 text-neutral-600 dark:text-neutral-400'>
        {practicalSummary}
      </p>
    </header>
  );
}
