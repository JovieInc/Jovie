export function AuthUnavailableCard() {
  return (
    <div
      data-testid='auth-clerk-unavailable'
      className='w-full rounded-[var(--radius-3xl)] border border-subtle bg-surface-0/95 px-6 py-7 text-center shadow-[0_24px_80px_rgba(0,0,0,0.48)] backdrop-blur-xl'
    >
      <p className='text-[0.75rem] font-[560] uppercase tracking-[0.14em] text-tertiary-token'>
        Auth unavailable
      </p>
      <h2 className='mt-3 text-[1.5rem] leading-[1.08] font-[590] tracking-[-0.03em] text-primary-token'>
        Clerk isn&apos;t configured here
      </h2>
      <p className='mt-3 text-[0.9375rem] leading-[1.55] text-secondary-token'>
        Clerk is not configured for this environment.
      </p>
    </div>
  );
}
