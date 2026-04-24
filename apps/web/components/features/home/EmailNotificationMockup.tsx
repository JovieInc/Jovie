/**
 * A compact email notification card showing a new release alert from Jovie.
 * Sits below the release card in the Release Destinations section.
 */
export function EmailNotificationMockup() {
  return (
    <div className='mx-auto w-full flex-1'>
      {/* Email card — grows to fill available height */}
      <div className='flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(23,24,31,0.98),rgba(13,14,19,0.98))] shadow-[0_24px_70px_rgba(0,0,0,0.24)]'>
        {/* Top edge highlight */}
        <div
          aria-hidden='true'
          className='h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.25),transparent)]'
        />

        {/* Email header */}
        <div className='border-b border-white/6 px-4 pb-2.5 pt-3'>
          <div className='flex items-center gap-2'>
            <div className='flex h-5 w-5 items-center justify-center rounded-full bg-[#5E6AD2]'>
              <span className='text-[8px] font-bold text-white'>J</span>
            </div>
            <p className='text-[10px] font-semibold text-white/70'>
              Jovie &middot; notifications@jov.ie
            </p>
          </div>
        </div>

        {/* Email body — flex-1 so it stretches */}
        <div className='flex flex-1 flex-col justify-between px-4 pb-4 pt-3'>
          <div>
            <p className='text-[12px] font-semibold tracking-[-0.01em] text-white'>
              New music from Tim White
            </p>
            <p className='mt-2 text-[11px] leading-[1.6] text-white/45'>
              Cosmic Gate &amp; Tim White just released &ldquo;The Deep
              End.&rdquo; Tap below to listen now.
            </p>
          </div>

          {/* CTA button — white */}
          <div className='mt-4 text-center'>
            <div className='inline-flex items-center rounded-full bg-white px-5 py-2 text-[11px] font-semibold tracking-[-0.01em] text-black shadow-[0_2px_8px_rgba(255,255,255,0.1)]'>
              Listen now
            </div>
          </div>

          <p className='mt-3 text-[9px] text-white/20'>
            You follow Tim White on Jovie
          </p>
        </div>
      </div>
    </div>
  );
}
