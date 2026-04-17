import { BellRing, ExternalLink, Music2, Ticket } from 'lucide-react';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { ArtistProfileSectionHeader } from './ArtistProfileSectionHeader';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileReactivationSectionProps {
  readonly reactivation: ArtistProfileLandingCopy['reactivation'];
  readonly notification: ArtistProfileLandingCopy['capture']['notification'];
}

export function ArtistProfileReactivationSection({
  reactivation,
  notification,
}: Readonly<ArtistProfileReactivationSectionProps>) {
  const releaseRow = reactivation.workflow.rows[0];
  const showRow = reactivation.workflow.rows[1];

  return (
    <ArtistProfileSectionShell
      className='overflow-hidden bg-[#040506] py-24 sm:py-28 lg:py-32'
      width='page'
    >
      <div className='mx-auto max-w-[1120px]'>
        <ArtistProfileSectionHeader
          align='center'
          headline={reactivation.headline}
          body={reactivation.subhead}
          className='max-w-[46rem]'
          bodyClassName='mx-auto max-w-[35rem]'
        />

        <div className='mx-auto mt-12 max-w-[31rem]'>
          <article className='overflow-hidden rounded-[1.5rem] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.015)),#07090d] p-3 shadow-[0_24px_64px_rgba(0,0,0,0.22)]'>
            <div className='rounded-[1.2rem] border border-white/7 bg-[#090c11] p-4 sm:p-5'>
              <div className='flex items-start gap-3'>
                <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-black'>
                  <BellRing className='h-4 w-4' strokeWidth={1.9} />
                </span>
                <div className='min-w-0 flex-1'>
                  <div className='flex items-center gap-2 text-[11px] text-white/38'>
                    <p className='font-medium tracking-[-0.01em]'>
                      {notification.appName}
                    </p>
                    <span>{notification.timeLabel}</span>
                  </div>
                  <p className='mt-2 text-[15px] font-semibold tracking-[-0.03em] text-primary-token'>
                    {notification.title}
                  </p>
                  <p className='mt-1.5 text-[13px] leading-[1.5] text-white/56'>
                    {notification.detail}
                  </p>
                </div>
              </div>

              <div className='mt-4 grid gap-2.5 sm:grid-cols-2'>
                <div className='rounded-[1rem] border border-white/8 bg-white/[0.03] p-3.5'>
                  <div className='flex items-center gap-2 text-[11px] font-medium text-white/48'>
                    <Music2 className='h-3.5 w-3.5' strokeWidth={1.85} />
                    {releaseRow?.trigger}
                  </div>
                  <p className='mt-3 text-[14px] font-semibold tracking-[-0.03em] text-primary-token'>
                    {releaseRow?.message}
                  </p>
                  <p className='mt-1.5 text-[12px] leading-[1.45] text-white/56'>
                    {releaseRow?.audience}
                  </p>
                  <div className='mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-black'>
                    {releaseRow?.destination}
                    <ExternalLink className='h-3 w-3' strokeWidth={2} />
                  </div>
                </div>

                <div className='rounded-[1rem] border border-white/8 bg-white/[0.03] p-3.5'>
                  <div className='flex items-center gap-2 text-[11px] font-medium text-white/48'>
                    <Ticket className='h-3.5 w-3.5' strokeWidth={1.85} />
                    {showRow?.trigger}
                  </div>
                  <p className='mt-3 text-[14px] font-semibold tracking-[-0.03em] text-primary-token'>
                    {showRow?.message}
                  </p>
                  <p className='mt-1.5 text-[12px] leading-[1.45] text-white/56'>
                    {showRow?.audience}
                  </p>
                  <div className='mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-black'>
                    {showRow?.destination}
                    <ExternalLink className='h-3 w-3' strokeWidth={2} />
                  </div>
                </div>
              </div>
            </div>
          </article>
        </div>
      </div>
    </ArtistProfileSectionShell>
  );
}
