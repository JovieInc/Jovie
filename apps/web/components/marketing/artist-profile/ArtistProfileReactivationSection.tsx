import { ArrowRight, BellRing, Mail, Sparkles } from 'lucide-react';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { getAccentCssVars } from '@/lib/ui/accent-palette';
import { ArtistProfileSectionHeader } from './ArtistProfileSectionHeader';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileReactivationSectionProps {
  readonly reactivation: ArtistProfileLandingCopy['reactivation'];
  readonly notification: ArtistProfileLandingCopy['capture']['notification'];
}

const OUTPUT_ICONS = {
  'release-alerts': Mail,
  'nearby-show-alerts': BellRing,
  'thank-you': Sparkles,
} as const;

const OUTPUT_ACCENTS = {
  'release-alerts': getAccentCssVars('purple').solid,
  'nearby-show-alerts': getAccentCssVars('orange').solid,
  'thank-you': getAccentCssVars('teal').solid,
} as const;

export function ArtistProfileReactivationSection({
  reactivation,
  notification,
}: Readonly<ArtistProfileReactivationSectionProps>) {
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

        <div className='mt-12 grid gap-8 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:items-start'>
          <div className='rounded-[1.5rem] bg-white/[0.02] p-2.5 shadow-[0_24px_64px_rgba(0,0,0,0.22)]'>
            <div className='rounded-[1.25rem] bg-[#07090d] px-4 py-4'>
              <div className='flex items-start gap-3'>
                <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-black'>
                  <BellRing className='h-4 w-4' strokeWidth={1.9} />
                </span>
                <div className='min-w-0'>
                  <div className='flex items-center gap-2 text-[11px] text-white/36'>
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
            </div>
          </div>

          <div className='space-y-3'>
            {reactivation.workflow.rows.map(row => (
              <article
                key={row.id}
                className='rounded-[1.35rem] bg-white/[0.024] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
              >
                <div className='flex flex-wrap items-center gap-2.5'>
                  <WorkflowBeat value={row.trigger} />
                  <WorkflowArrow />
                  <WorkflowBeat
                    label={reactivation.workflow.columns[1]}
                    tone='audience'
                    value={row.audience}
                  />
                  <WorkflowArrow />
                  <WorkflowBeat
                    label={reactivation.workflow.columns[2]}
                    tone='message'
                    value={row.message}
                  />
                  <WorkflowArrow />
                  <WorkflowBeat
                    label={reactivation.workflow.columns[3]}
                    tone='destination'
                    value={row.destination}
                  />
                </div>
              </article>
            ))}

            <div className='grid gap-3 pt-2 sm:grid-cols-3'>
              {reactivation.outputs.map(output => {
                const Icon = OUTPUT_ICONS[output.id];
                const accent = OUTPUT_ACCENTS[output.id];

                return (
                  <article
                    key={output.id}
                    className='rounded-[1.25rem] bg-white/[0.028] p-4'
                  >
                    <div className='flex items-center justify-between gap-3'>
                      <Icon
                        className='h-4 w-4'
                        style={{ color: accent }}
                        strokeWidth={1.85}
                      />
                    </div>
                    <p className='mt-3 text-[0.98rem] font-semibold leading-[1.35] tracking-[-0.03em] text-primary-token'>
                      {output.title}
                    </p>
                    <div className='mt-4 space-y-1.5'>
                      <p className='text-[13px] leading-[1.5] text-secondary-token'>
                        {output.detail}
                      </p>
                      <p className='text-[12px] font-medium tracking-[-0.01em] text-tertiary-token'>
                        {output.destination}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </ArtistProfileSectionShell>
  );
}

function WorkflowCell({
  label,
  tone,
  value,
}: Readonly<{
  label: string;
  tone?: 'audience' | 'default' | 'destination' | 'message';
  value: string;
}>) {
  return (
    <div
      className={
        tone === 'destination'
          ? 'rounded-full border border-white/12 bg-white/[0.07] px-3.5 py-2 text-primary-token'
          : tone === 'message'
            ? 'rounded-full border border-white/8 bg-white/[0.045] px-3.5 py-2 text-white/88'
            : tone === 'audience'
              ? 'rounded-full border border-white/8 bg-white/[0.028] px-3.5 py-2 text-secondary-token'
              : 'rounded-full border border-white/10 bg-white/[0.06] px-3.5 py-2 text-primary-token'
      }
    >
      <p className='sr-only'>{label}</p>
      <p
        className={
          tone === 'destination'
            ? 'text-[15px] font-semibold tracking-[-0.03em] text-primary-token'
            : tone === 'audience'
              ? 'text-[14px] font-medium tracking-[-0.02em] text-secondary-token'
              : tone === 'message'
                ? 'text-[14px] font-medium tracking-[-0.02em] text-white/88'
                : 'text-[15px] font-semibold tracking-[-0.03em] text-primary-token'
        }
      >
        {value}
      </p>
    </div>
  );
}

function WorkflowBeat({
  label = 'Trigger',
  tone,
  value,
}: Readonly<{
  label?: string;
  tone?: 'audience' | 'default' | 'destination' | 'message';
  value: string;
}>) {
  return <WorkflowCell label={label} tone={tone} value={value} />;
}

function WorkflowArrow() {
  return (
    <span
      aria-hidden='true'
      className='inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/8 bg-white/[0.02] text-white/35'
    >
      <ArrowRight className='h-3.5 w-3.5' strokeWidth={1.85} />
    </span>
  );
}
