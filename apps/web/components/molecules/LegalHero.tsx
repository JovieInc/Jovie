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
    <header className='max-w-3xl border-b border-subtle pb-8'>
      <h1 className='text-balance text-3xl font-semibold text-primary-token sm:text-4xl'>
        {title}
      </h1>
      {lastUpdated ? (
        <p className='mt-3 text-sm tabular-nums text-tertiary-token'>
          Last updated: {lastUpdated}
        </p>
      ) : null}
      <p className='mt-6 max-w-2xl text-mid leading-7 text-secondary-token'>
        {practicalSummary}
      </p>
    </header>
  );
}
