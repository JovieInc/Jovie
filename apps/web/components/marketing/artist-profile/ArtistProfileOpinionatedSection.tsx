import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileOpinionatedSectionProps {
  readonly opinionated: ArtistProfileLandingCopy['opinionated'];
}

function OpinionatedRulesSurface({
  opinionated,
}: Readonly<ArtistProfileOpinionatedSectionProps>) {
  return (
    <div className='relative overflow-hidden rounded-[1.85rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.048),rgba(255,255,255,0.018)),#050505] p-5 shadow-[0_28px_80px_rgba(0,0,0,0.32)]'>
      <div className='rounded-[1.35rem] bg-black/28 p-4 sm:p-5'>
        <div className='flex items-center justify-between gap-4'>
          <div>
            <p className='text-[12px] font-semibold tracking-[-0.01em] text-primary-token'>
              Fan context
            </p>
            <p className='mt-1 text-[12px] leading-snug text-tertiary-token'>
              Jovie chooses the obvious next action.
            </p>
          </div>
          <div
            className='hidden h-2 w-2 rounded-full bg-white/70 shadow-[0_0_18px_rgba(255,255,255,0.5)] sm:block'
            aria-hidden='true'
          />
        </div>

        <div className='mt-6 space-y-3'>
          {opinionated.rules.map(rule => (
            <div
              key={rule.id}
              className='grid items-center gap-3 rounded-[1rem] bg-white/[0.026] px-3 py-3 sm:grid-cols-[minmax(0,1fr)_4.5rem_minmax(0,1fr)]'
            >
              <span className='truncate text-[13px] font-medium tracking-[-0.02em] text-secondary-token'>
                {rule.context}
              </span>
              <span className='hidden text-center text-white/24 sm:block'>
                →
              </span>
              <span className='truncate text-[13px] font-semibold tracking-[-0.02em] text-primary-token sm:text-right'>
                {rule.result}
              </span>
            </div>
          ))}
        </div>

        <div className='mt-5 rounded-[1.1rem] bg-white/[0.035] p-4'>
          <div className='flex items-center justify-between gap-4'>
            <span className='text-[13px] font-semibold tracking-[-0.02em] text-primary-token'>
              Polished profile
            </span>
            <span className='rounded-full bg-white px-3 py-1 text-[11px] font-semibold tracking-[-0.02em] text-black'>
              Default
            </span>
          </div>
          <div className='mt-4 grid grid-cols-3 gap-2'>
            <span className='h-14 rounded-[0.85rem] bg-white/[0.075]' />
            <span className='h-14 rounded-[0.85rem] bg-white/[0.052]' />
            <span className='h-14 rounded-[0.85rem] bg-white/[0.038]' />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ArtistProfileOpinionatedSection({
  opinionated,
}: Readonly<ArtistProfileOpinionatedSectionProps>) {
  return (
    <ArtistProfileSectionShell className='bg-white/[0.01]'>
      <div className='grid gap-10 lg:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)] lg:items-start'>
        <div>
          <h2 className='marketing-h2-linear max-w-[14ch] text-primary-token'>
            {opinionated.headline}
          </h2>
          <p className='mt-5 max-w-[36rem] text-[15px] leading-[1.7] text-secondary-token'>
            {opinionated.body}
          </p>
          <div className='mt-8 grid gap-3 sm:grid-cols-3'>
            {opinionated.principles.map(principle => (
              <div
                key={principle}
                className='rounded-[1.15rem] bg-white/[0.03] px-4 py-5 text-[14px] font-medium text-primary-token'
              >
                {principle}
              </div>
            ))}
          </div>
        </div>

        <OpinionatedRulesSurface opinionated={opinionated} />
      </div>
    </ArtistProfileSectionShell>
  );
}
