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
 'homepage-profile-outcome-duo relative w-full bg-base',
 className
 )}
 aria-label='Artist Profiles Outcomes'
 >
 <div className='homepage-profile-outcome-inner mx-auto w-full'>
 <h2 className='homepage-profile-outcome-heading mx-auto text-center text-primary-token'>
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
 <div className='relative z-10 flex w-full flex-1 items-center justify-center'>
 {children}
 </div>
 <h3 className='homepage-profile-outcome-title relative z-10 text-center text-primary-token'>
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
 className='mx-auto mb-5 block h-1 w-9 rounded-xs bg-surface-1/[0.14]'
 />
 );
}

function DrawerTitle({ title }: Readonly<{ title: string }>) {
 return (
 <p className='mb-4 px-1 text-base font-semibold tracking-tight text-primary-token'>
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
 'flex items-center justify-between rounded-xl border px-5 py-4',
 featured
 ? 'border-(--color-bg-base) bg-(--color-bg-base)'
 : 'border-subtle bg-surface-1'
 )}
 >
 <span
 className={cn(
 'text-base font-semibold tracking-tight',
 featured
 ? 'text-primary-token text-primary-token'
 : 'text-primary-token'
 )}
 >
 {row.amount}
 </span>
 <span
 className={cn(
 'text-xs font-medium',
 featured ? 'text-secondary-token' : 'text-tertiary-token'
 )}
 >
 {row.currency}
 </span>
 </div>
 );
 })}
 </div>
 <div className='mt-4 block w-full rounded-xl bg-(--color-bg-base) py-4 text-center text-sm font-semibold tracking-tight text-primary-token text-primary-token'>
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
 'grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3.5 px-1 py-4',
 index === 0 ? 'pt-1.5' : 'border-t border-subtle'
 )}
 >
 <span className='text-2xs font-medium uppercase leading-relaxed tracking-tight text-tertiary-token'>
 {row.month}
 <strong className='mt-0.5 block text-lg font-semibold normal-case tracking-tight text-primary-token'>
 {row.day}
 </strong>
 </span>
 <span className='min-w-0'>
 <span className='block truncate text-sm font-semibold tracking-tight text-primary-token'>
 {row.venue}
 </span>
 <span className='mt-0.5 block truncate text-xs text-tertiary-token'>
 {row.location}
 </span>
 </span>
 <span className='text-xs font-medium text-tertiary-token'>
 {row.ctaLabel}
 </span>
 </div>
 ))}
 </div>
 </div>
 );
}
