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
    <header className='min-w-0'>
      <h1 className='text-3xl font-semibold text-balance text-primary-token sm:text-4xl'>
        {title}
      </h1>
      {lastUpdated ? (
        <p className='mt-3 text-sm text-tertiary-token'>
          Last updated: {lastUpdated}
        </p>
      ) : null}
      <p className='mt-6 text-mid leading-7 text-pretty text-secondary-token'>
        {practicalSummary}
      </p>
    </header>
  );
}
