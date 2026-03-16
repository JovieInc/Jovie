const ARTIST_COUNT = 47;

export function SocialProofSection() {
  return (
    <section className='py-[var(--linear-section-pt-sm)] px-5 sm:px-6'>
      <div className='mx-auto flex max-w-[var(--linear-content-max)] flex-col items-center gap-8 text-center'>
        {/* Founder credibility */}
        <div className='flex flex-col items-center gap-3'>
          <p className='text-[var(--linear-label-size)] font-medium uppercase tracking-[0.1em] text-[var(--linear-text-tertiary)]'>
            Built by a musician
          </p>
          <p className='max-w-[480px] text-base leading-relaxed text-[var(--linear-text-secondary)]'>
            Created by{' '}
            <span className='font-medium text-[var(--linear-text-primary)]'>
              Tim White
            </span>
            {', '}
            who has released music on Sony, Universal, AWAL, and Armada. Every
            feature is designed from real artist experience.
          </p>
        </div>

        {/* Artist counter */}
        <div className='flex flex-col items-center gap-1'>
          <p className='text-3xl font-semibold tabular-nums text-[var(--linear-text-primary)] sm:text-4xl'>
            {ARTIST_COUNT}+
          </p>
          <p className='text-sm text-[var(--linear-text-tertiary)]'>
            artists already on Jovie
          </p>
        </div>
      </div>
    </section>
  );
}
