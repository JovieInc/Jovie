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
        'homepage-profile-outcome-duo relative w-full bg-black',
        className
      )}
      aria-label='Artist profiles outcomes'
    >
      <div className='homepage-profile-outcome-inner mx-auto w-full'>
        <h2 className='homepage-profile-outcome-heading mx-auto text-center text-white'>
          {headline}
        </h2>

        <div className='homepage-profile-outcome-grid'>
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
    <article className='homepage-profile-outcome-tile relative flex flex-col items-center overflow-hidden'>
      <div
        aria-hidden='true'
        className='homepage-profile-outcome-tile__glow pointer-events-none absolute inset-0'
      />
      <div className='relative z-[1] flex w-full flex-1 items-center justify-center'>
        {children}
      </div>
      <h3 className='homepage-profile-outcome-title relative z-[1] text-center text-white'>
        {label}
      </h3>
    </article>
  );
}

const DRAWER_BASE_CLASSES = 'homepage-profile-drawer relative w-full';

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
                'flex items-center justify-between rounded-[14px] border px-[18px] py-[14px]',
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
      <div className='mt-[14px] block w-full rounded-[14px] bg-[#f5f5f7] py-[14px] text-center text-[14px] font-semibold tracking-[-0.01em] text-black'>
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
