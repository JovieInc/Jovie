import { ArrowRight, BellRing, Mail, Sparkles } from 'lucide-react';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileOpinionatedSectionProps {
  readonly opinionated: ArtistProfileLandingCopy['opinionated'];
}

interface ArtistProfileReactivationSectionProps {
  readonly reactivation: ArtistProfileLandingCopy['reactivation'];
}

const OUTPUT_ICONS = {
  'release-alerts': Mail,
  'nearby-show-alerts': BellRing,
  'thank-you': Sparkles,
} as const;

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

export function ArtistProfileReactivationSection({
  reactivation,
}: Readonly<ArtistProfileReactivationSectionProps>) {
  return (
    <ArtistProfileSectionShell
      className='overflow-hidden bg-[#040506] py-24 sm:py-28 lg:py-32'
      width='page'
    >
      <div className='mx-auto max-w-[1040px]'>
        <div className='mx-auto max-w-[38rem] text-center'>
          <h2 className='text-[clamp(2.8rem,5vw,4.6rem)] font-semibold leading-[0.92] tracking-[-0.07em] text-primary-token'>
            {reactivation.headline}
          </h2>
          <p className='mx-auto mt-5 max-w-[33rem] text-[clamp(1rem,1.5vw,1.14rem)] leading-[1.65] text-secondary-token'>
            {reactivation.subhead}
          </p>
        </div>

        <div className='mt-12 overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.025] shadow-[0_24px_80px_rgba(0,0,0,0.28)] lg:mt-14'>
          <div className='space-y-3 px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8'>
            {reactivation.workflow.rows.map(row => (
              <article
                key={row.id}
                className='rounded-[1.4rem] border border-white/7 bg-white/[0.018] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:px-5 sm:py-5'
              >
                <div className='flex flex-wrap items-center gap-2.5 lg:gap-3'>
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
          </div>

          <div className='border-t border-white/8 bg-white/[0.015]'>
            <div className='grid divide-y divide-white/8 lg:grid-cols-3 lg:divide-x lg:divide-y-0'>
              {reactivation.outputs.map(output => {
                const Icon = OUTPUT_ICONS[output.id];

                return (
                  <article
                    key={output.id}
                    className='px-5 py-5 sm:px-6 lg:px-7 lg:py-6'
                  >
                    <div className='flex items-center justify-between gap-3'>
                      <p className='text-[12px] font-medium tracking-[-0.01em] text-white/64'>
                        {output.label}
                      </p>
                      <Icon
                        className='h-4 w-4 text-white/48'
                        strokeWidth={1.85}
                      />
                    </div>
                    <p className='mt-3 max-w-[18rem] text-[1.02rem] font-semibold leading-[1.35] tracking-[-0.03em] text-primary-token'>
                      {output.title}
                    </p>
                    <div className='mt-4 flex flex-col items-start gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4'>
                      <span className='text-[13px] leading-[1.5] text-secondary-token'>
                        {output.detail}
                      </span>
                      <span className='text-right text-[12px] font-medium tracking-[-0.01em] text-tertiary-token'>
                        {output.destination}
                      </span>
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
