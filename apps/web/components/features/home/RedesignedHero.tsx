import { ClaimHandleForm } from './claim-handle';

export async function RedesignedHero() {
  return (
    <section className='relative flex flex-col items-center overflow-hidden px-5 pt-[8.2rem] pb-[5rem] sm:px-6 md:pt-[5.7rem] md:pb-[4rem] xl:pt-[12.5rem] xl:pb-[7rem]'>
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        style={{ background: 'var(--linear-hero-backdrop)' }}
      />

      <div className='hero-stagger relative z-10 mx-auto flex w-full max-w-[var(--linear-content-max)] flex-col items-center text-center'>
        <h1 className='marketing-h1-linear text-balance text-primary-token'>
          One link to grow your music career.
        </h1>

        <p className='marketing-lead-linear mt-8 max-w-[40rem] text-balance text-tertiary-token'>
          Import your catalog. Fans get notified when you release.
        </p>

        <div className='mt-10 w-full max-w-[32rem]'>
          <ClaimHandleForm size='hero' />
        </div>

        <p className='mt-5 text-[length:var(--linear-label-size)] font-[number:var(--linear-font-weight-normal)] tracking-[0.01em] text-tertiary-token'>
          <span
            aria-hidden='true'
            className='mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[var(--linear-success)] shadow-[0_0_6px_var(--linear-success)]'
          />{' '}
          Free forever · Live in 60 seconds
        </p>
      </div>
    </section>
  );
}
