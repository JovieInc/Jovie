import { BellRing } from 'lucide-react';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { ArtistProfileSectionHeader } from './ArtistProfileSectionHeader';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileReactivationSectionProps {
  readonly id?: string;
  readonly reactivation: ArtistProfileLandingCopy['reactivation'];
  readonly notification: ArtistProfileLandingCopy['capture']['notification'];
}

export function ArtistProfileReactivationSection({
  id,
  reactivation,
  notification,
}: Readonly<ArtistProfileReactivationSectionProps>) {
  const releaseOutput = reactivation.outputs[0];

  return (
    <ArtistProfileSectionShell
      className='overflow-hidden bg-[#040506] py-24 sm:py-28 lg:py-32'
      id={id}
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

        <div className='mx-auto mt-12 flex max-w-[24rem] justify-center'>
          <div className='relative w-full'>
            <div
              aria-hidden='true'
              className='pointer-events-none absolute inset-x-8 top-3 h-14 rounded-full bg-white/10 blur-3xl'
            />
            <article className='relative overflow-hidden rounded-[1.6rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.015)),#07090d] p-3 shadow-[0_24px_64px_rgba(0,0,0,0.28)]'>
              <div className='rounded-[1.3rem] border border-white/8 bg-[#0b0e13] px-4 py-3.5'>
                <div className='flex items-start gap-3'>
                  <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-[1rem] bg-white text-black shadow-[0_10px_24px_rgba(255,255,255,0.08)]'>
                    <BellRing className='h-4 w-4' strokeWidth={1.9} />
                  </span>
                  <div className='min-w-0 flex-1'>
                    <div className='flex items-center gap-2 text-[11px] text-white/42'>
                      <p className='font-medium tracking-[-0.01em]'>
                        {notification.appName}
                      </p>
                      <span>{notification.timeLabel}</span>
                    </div>
                    <p className='mt-2 text-[14px] font-semibold tracking-[-0.03em] text-primary-token'>
                      {releaseOutput?.title ?? notification.title}
                    </p>
                    <p className='mt-1.5 text-[12.5px] leading-[1.45] text-white/58'>
                      {releaseOutput?.detail ?? notification.detail}
                    </p>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>
      </div>
    </ArtistProfileSectionShell>
  );
}
