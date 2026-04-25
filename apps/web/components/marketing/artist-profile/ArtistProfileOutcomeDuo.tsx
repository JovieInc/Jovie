import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { cn } from '@/lib/utils';

export type ArtistProfileOutcomeDuoCopy =
  ArtistProfileLandingCopy['outcomeDuo'];

interface ArtistProfileOutcomeDuoProps {
  readonly headline: string;
  readonly duo: ArtistProfileOutcomeDuoCopy;
  readonly className?: string;
}

export function ArtistProfileOutcomeDuo({
  headline,
  duo,
  className,
}: Readonly<ArtistProfileOutcomeDuoProps>) {
  return (
    <section
      data-testid='artist-profile-outcome-duo'
      className={cn(
        'relative w-full bg-black py-24 sm:py-28 lg:py-32',
        className
      )}
      aria-label='Artist profiles outcomes'
    >
      <div className='mx-auto w-full max-w-[var(--linear-content-max)] px-5 sm:px-6 lg:px-0'>
        <h2 className='mx-auto max-w-[20ch] text-center text-[clamp(2.5rem,5vw,4.5rem)] font-bold leading-[1] tracking-[-0.04em] text-white'>
          {headline}
        </h2>

        <div className='mt-16 grid gap-5 sm:mt-20 md:grid-cols-2 md:gap-6'>
          <OutcomeTile label={duo.cards.getPaid.label}>
            <PayDrawerPreview card={duo.cards.getPaid} />
          </OutcomeTile>
          <OutcomeTile label={duo.cards.sellOut.label}>
            <TourDrawerPreview card={duo.cards.sellOut} />
          </OutcomeTile>
        </div>
      </div>
    </section>
  );
}

function OutcomeTile({
  label,
  children,
}: Readonly<{
  label: string;
  children: React.ReactNode;
}>) {
  return (
    <article className='relative flex min-h-[560px] flex-col items-center overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#141416] px-6 pb-12 pt-14 sm:min-h-[620px] sm:px-8 sm:pt-16'>
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,255,255,0.045),transparent_55%)]'
      />
      <div className='relative z-[1] flex w-full flex-1 items-center justify-center'>
        {children}
      </div>
      <h3 className='relative z-[1] mt-10 text-center text-[clamp(1.75rem,2.6vw,2.25rem)] font-bold leading-[1] tracking-[-0.035em] text-white'>
        {label}
      </h3>
    </article>
  );
}

const DRAWER_BASE_CLASSES =
  'relative w-full max-w-[340px] rounded-[28px] border border-white/10 bg-[#1f1f22] p-[18px] pb-[22px] shadow-[0_50px_100px_rgba(0,0,0,0.65),0_12px_32px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.06)]';

function DrawerHandle() {
  return (
    <span
      aria-hidden='true'
      className='mx-auto mb-[18px] block h-[5px] w-9 rounded-[3px] bg-white/[0.14]'
    />
  );
}

function DrawerTitle({ title }: Readonly<{ title: string }>) {
  return (
    <p className='mb-[14px] px-1 text-[17px] font-semibold tracking-[-0.02em] text-white'>
      {title}
    </p>
  );
}

function PayDrawerPreview({
  card,
}: Readonly<{ card: ArtistProfileOutcomeDuoCopy['cards']['getPaid'] }>) {
  return (
    <div className={DRAWER_BASE_CLASSES} aria-hidden='true'>
      <DrawerHandle />
      <DrawerTitle title={card.drawerTitle} />
      <div className='flex flex-col gap-2'>
        {card.amountRows.map(row => {
          const featured = row.featured === true;
          return (
            <div
              key={row.id}
              className={cn(
                'flex items-center justify-between rounded-2xl border px-[18px] py-[14px]',
                featured
                  ? 'border-[#f5f5f7] bg-[#f5f5f7]'
                  : 'border-white/[0.08] bg-white/[0.04]'
              )}
            >
              <span
                className={cn(
                  'text-[16px] font-semibold tracking-[-0.02em]',
                  featured ? 'text-black' : 'text-white'
                )}
              >
                {row.amount}
              </span>
              <span
                className={cn(
                  'text-[12px] font-medium',
                  featured ? 'text-black/60' : 'text-white/56'
                )}
              >
                {row.currency}
              </span>
            </div>
          );
        })}
      </div>
      <div className='mt-[14px] block w-full rounded-2xl bg-[#f5f5f7] py-[14px] text-center text-[14px] font-semibold tracking-[-0.01em] text-black'>
        {card.ctaLabel}
      </div>
    </div>
  );
}

function TourDrawerPreview({
  card,
}: Readonly<{ card: ArtistProfileOutcomeDuoCopy['cards']['sellOut'] }>) {
  return (
    <div className={DRAWER_BASE_CLASSES} aria-hidden='true'>
      <DrawerHandle />
      <DrawerTitle title={card.drawerTitle} />
      <div className='flex flex-col'>
        {card.drawerRows.map((row, index) => (
          <div
            key={row.id}
            className={cn(
              'grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3.5 px-1 py-[14px]',
              index === 0 ? 'pt-1.5' : 'border-t border-white/[0.08]'
            )}
          >
            <span className='text-[11px] font-medium uppercase leading-[1.1] tracking-[0.02em] text-white/56'>
              {row.month}
              <strong className='mt-0.5 block text-[18px] font-semibold normal-case tracking-[-0.02em] text-white'>
                {row.day}
              </strong>
            </span>
            <span className='min-w-0'>
              <span className='block truncate text-[14px] font-semibold tracking-[-0.02em] text-white'>
                {row.venue}
              </span>
              <span className='mt-0.5 block truncate text-[12px] text-white/56'>
                {row.location}
              </span>
            </span>
            <span className='text-[12px] font-medium text-white/62'>
              {row.ctaLabel}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
