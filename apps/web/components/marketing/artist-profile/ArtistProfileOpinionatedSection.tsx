import { ArrowRight, MapPin, Music2, QrCode } from 'lucide-react';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { cn } from '@/lib/utils';
import { SHELL_H2_CLASS, SHELL_LEAD_CLASS } from './ArtistProfileSectionHeader';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileOpinionatedSectionProps {
 readonly opinionated: ArtistProfileLandingCopy['opinionated'];
}

const DECISION_ICONS = {
 release: Music2,
 tour: MapPin,
 support: QrCode,
} as const;

export function ArtistProfileOpinionatedSection({
 opinionated,
}: Readonly<ArtistProfileOpinionatedSectionProps>) {
 return (
 <ArtistProfileSectionShell>
 <div className='grid items-start gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(30rem,1.2fr)] lg:gap-20'>
 <div className='max-w-xl lg:sticky lg:top-32'>
 <p className='text-xs font-medium tracking-wide text-secondary-token'>
 {opinionated.eyebrow}
 </p>
 <h2 className={cn(SHELL_H2_CLASS, 'mt-5 max-w-xl')}>
 {opinionated.headline}
 </h2>
 <p className={cn(SHELL_LEAD_CLASS, 'mt-6')}>{opinionated.body}</p>
 <p className='mt-7 inline-flex rounded-full border border-subtle bg-surface-0 px-4 py-2 font-mono text-xs text-secondary-token'>
 {opinionated.principle}
 </p>
 </div>

 <div className='overflow-hidden rounded-2xl border border-subtle bg-surface-0'>
 <div
 aria-hidden='true'
 className='hidden grid-cols-[1fr_1fr_auto] gap-6 border-b border-subtle px-5 py-4 text-3xs font-semibold text-tertiary-token sm:grid'
 >
 {opinionated.columns.map(column => (
 <span key={column}>{column}</span>
 ))}
 </div>

 <div className='divide-y divide-subtle'>
 {opinionated.decisions.map(decision => {
 const Icon = DECISION_ICONS[decision.id];

 return (
 <article key={decision.id} className='px-5 py-6'>
 <dl className='grid gap-5 sm:grid-cols-[1fr_1fr_auto] sm:items-center sm:gap-6'>
 <div>
 <dt className='sr-only'>{opinionated.columns[0]}</dt>
 <dd className='flex items-center gap-3'>
 <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-subtle bg-surface-1 text-secondary-token'>
 <Icon className='h-4 w-4' aria-hidden='true' />
 </span>
 <span className='text-sm font-semibold text-primary-token'>
 {decision.context}
 </span>
 </dd>
 </div>

 <div>
 <dt className='sr-only'>{opinionated.columns[1]}</dt>
 <dd className='text-app text-secondary-token'>
 {decision.signal}
 </dd>
 </div>

 <div>
 <dt className='sr-only'>{opinionated.columns[2]}</dt>
 <dd className='flex items-center gap-3 sm:justify-end'>
 <ArrowRight
 className='h-4 w-4 text-tertiary-token'
 aria-hidden='true'
 />
 <span className='font-mono text-xs font-semibold text-primary-token'>
 {decision.action}
 </span>
 </dd>
 </div>
 </dl>
 </article>
 );
 })}
 </div>
 </div>
 </div>
 </ArtistProfileSectionShell>
 );
}
