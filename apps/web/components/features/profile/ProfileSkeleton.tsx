/**
 * Profile loading skeleton — matches the V2 ProfileViewportShell + ArtistHero + ProfileScrollBody layout.
 * Full-bleed hero gradient at top, then rounded panel placeholders in the scroll body zone.
 */
export function ProfileSkeleton() {
  const pulse = 'animate-pulse motion-reduce:animate-none';
  const panelClass =
    'rounded-[var(--profile-card-radius)] bg-white/[0.04] backdrop-blur-sm';

  return (
    <output
      className='relative min-h-[100dvh] overflow-hidden bg-[#0a0b0e] text-white/90'
      aria-busy='true'
      aria-label='Loading Jovie profile'
    >
      {/* Ambient background blur placeholder */}
      <div className='absolute inset-0' aria-hidden='true'>
        <div className='absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_32%)]' />
      </div>

      {/* Viewport shell */}
      <div className='relative mx-auto flex min-h-[100dvh] w-full max-w-[680px] items-stretch justify-center md:items-center md:px-6 md:py-8'>
        <div className='relative flex w-full flex-col overflow-hidden bg-white/[0.02] md:min-h-0 md:rounded-[var(--profile-shell-card-radius)] md:border md:border-white/[0.06]'>
          {/* Hero placeholder — matches ArtistHero height */}
          <div
            className={`relative h-[48dvh] max-h-[620px] min-h-[420px] w-full overflow-hidden md:h-[56dvh] md:min-h-[520px] md:rounded-t-[var(--profile-shell-card-radius)] ${pulse}`}
          >
            <div className='absolute inset-0 bg-gradient-to-b from-white/[0.04] via-[#12141a]/60 to-[#0a0b0e]/95' />

            {/* Top bar: spotlight pill + action buttons */}
            <div className='relative flex h-full flex-col justify-between px-5 pb-6 pt-[max(env(safe-area-inset-top),1rem)] md:px-7 md:pb-8 md:pt-6'>
              <div className='flex justify-between gap-3'>
                <div
                  className={`h-[52px] w-[90px] rounded-full bg-white/[0.06] ${pulse}`}
                />
                <div className='flex items-center gap-2'>
                  <div
                    className={`h-11 w-11 rounded-full bg-white/[0.06] ${pulse}`}
                  />
                  <div
                    className={`h-11 w-[76px] rounded-full bg-white/[0.06] ${pulse}`}
                  />
                  <div
                    className={`h-11 w-11 rounded-full bg-white/[0.06] ${pulse}`}
                  />
                </div>
              </div>

              {/* Artist name + Play button + primary CTA */}
              <div className='mt-auto max-w-[32rem] space-y-4'>
                <div className='flex items-end justify-between gap-4'>
                  <div className='space-y-2'>
                    <div
                      className={`h-3 w-24 rounded-full bg-white/[0.08] ${pulse}`}
                    />
                    <div
                      className={`h-10 w-56 rounded-lg bg-white/[0.10] md:h-14 md:w-72 ${pulse}`}
                    />
                  </div>
                  <div
                    className={`h-11 w-[88px] shrink-0 rounded-full bg-white/[0.06] ${pulse}`}
                  />
                </div>
                {/* Primary action placeholder (e.g. Get Tickets, Listen) */}
                <div className='flex flex-wrap items-center gap-3'>
                  <div
                    className={`h-12 w-40 rounded-full bg-white/[0.08] ${pulse}`}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Scroll body placeholder — matches ProfileScrollBody sections */}
          <div className='flex-1 px-5 pt-6 pb-[max(env(safe-area-inset-bottom),28px)] md:px-7 md:pt-7 md:pb-8 space-y-7'>
            {/* Featured section placeholder */}
            <div className='space-y-3'>
              <div className={`h-4 w-20 rounded bg-white/[0.06] ${pulse}`} />
              <div className={`${panelClass} px-5 py-5 space-y-3 ${pulse}`}>
                <div className='flex items-center gap-3'>
                  <div className='h-14 w-14 shrink-0 rounded-xl bg-white/[0.06]' />
                  <div className='flex-1 space-y-2'>
                    <div className='h-4 w-32 rounded bg-white/[0.06]' />
                    <div className='h-3 w-24 rounded bg-white/[0.06]' />
                  </div>
                </div>
              </div>
            </div>

            {/* Subscribe section placeholder */}
            <div className='space-y-3'>
              <div className={`h-4 w-20 rounded bg-white/[0.06] ${pulse}`} />
              <div className={`${panelClass} px-5 py-5 space-y-3 ${pulse}`}>
                <div className='h-5 w-48 rounded bg-white/[0.06]' />
                <div className='h-12 w-full rounded-full bg-white/[0.06]' />
              </div>
            </div>

            {/* Tour dates section placeholder */}
            <div className='space-y-3'>
              <div className={`h-4 w-24 rounded bg-white/[0.06] ${pulse}`} />
              <div className={`${panelClass} px-5 py-5 space-y-4 ${pulse}`}>
                <div className='flex items-center justify-between'>
                  <div className='space-y-1.5'>
                    <div className='h-4 w-28 rounded bg-white/[0.06]' />
                    <div className='h-3 w-40 rounded bg-white/[0.06]' />
                  </div>
                  <div className='h-9 w-20 rounded-full bg-white/[0.06]' />
                </div>
                <div className='flex items-center justify-between'>
                  <div className='space-y-1.5'>
                    <div className='h-4 w-32 rounded bg-white/[0.06]' />
                    <div className='h-3 w-36 rounded bg-white/[0.06]' />
                  </div>
                  <div className='h-9 w-20 rounded-full bg-white/[0.06]' />
                </div>
              </div>
            </div>

            {/* About section placeholder */}
            <div className='space-y-3'>
              <div className={`h-4 w-14 rounded bg-white/[0.06] ${pulse}`} />
              <div className={`${panelClass} px-5 py-5 space-y-3 ${pulse}`}>
                <div className='h-7 w-40 rounded-full bg-white/[0.06]' />
                <div className='h-4 w-full rounded bg-white/[0.06]' />
                <div className='h-4 w-3/4 rounded bg-white/[0.06]' />
              </div>
            </div>

            {/* Connect / social links section placeholder */}
            <div className='space-y-3'>
              <div className={`h-4 w-16 rounded bg-white/[0.06] ${pulse}`} />
              <div className='flex flex-wrap gap-2.5'>
                <div
                  className={`h-11 w-11 rounded-full bg-white/[0.06] ${pulse}`}
                />
                <div
                  className={`h-11 w-11 rounded-full bg-white/[0.06] ${pulse}`}
                />
                <div
                  className={`h-11 w-11 rounded-full bg-white/[0.06] ${pulse}`}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </output>
  );
}
