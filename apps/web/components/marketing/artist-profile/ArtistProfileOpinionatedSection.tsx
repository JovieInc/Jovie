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
      <div className='mx-auto max-w-[1120px]'>
        <div className='mx-auto max-w-[40rem] text-center'>
          <p className='text-[11px] font-semibold uppercase tracking-[0.26em] text-white/64'>
            {reactivation.eyebrow}
          </p>
          <h2 className='mt-4 text-[clamp(3rem,6vw,5.6rem)] font-semibold leading-[0.9] tracking-[-0.08em] text-primary-token'>
            {reactivation.headline}
          </h2>
          <p className='mx-auto mt-4 max-w-[34rem] text-[clamp(1rem,1.8vw,1.28rem)] font-medium leading-[1.3] tracking-[-0.03em] text-secondary-token'>
            {reactivation.subhead}
          </p>
        </div>

        <div className='relative mt-12 lg:mt-14'>
          <div
            className='pointer-events-none absolute left-1/2 top-10 h-48 w-48 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.12),rgba(255,255,255,0))] blur-3xl'
            aria-hidden='true'
          />

          <div className='relative overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] px-4 py-4 shadow-[0_30px_120px_rgba(0,0,0,0.38)] sm:px-5 sm:py-5 lg:px-7 lg:py-7'>
            <div
              className='absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),rgba(0,0,0,0))]'
              aria-hidden='true'
            />

            <div className='relative hidden grid-cols-[minmax(0,1.1fr)_24px_minmax(0,1fr)_24px_minmax(0,1fr)_24px_minmax(0,0.88fr)] items-center gap-y-4 border-b border-white/8 pb-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60 lg:grid'>
              <span>{reactivation.workflow.columns[0]}</span>
              <span />
              <span>{reactivation.workflow.columns[1]}</span>
              <span />
              <span>{reactivation.workflow.columns[2]}</span>
              <span />
              <span>{reactivation.workflow.columns[3]}</span>
            </div>

            <div className='relative mt-2 space-y-3 lg:mt-4 lg:space-y-4'>
              {reactivation.workflow.rows.map(row => (
                <div
                  key={row.id}
                  className='rounded-[1.5rem] border border-white/8 bg-white/[0.03] px-4 py-4 backdrop-blur-xl lg:grid lg:grid-cols-[minmax(0,1.1fr)_24px_minmax(0,1fr)_24px_minmax(0,1fr)_24px_minmax(0,0.88fr)] lg:items-center lg:gap-x-2 lg:px-5 lg:py-4'
                >
                  <WorkflowCell
                    label={reactivation.workflow.columns[0]}
                    value={row.trigger}
                  />
                  <WorkflowArrow />
                  <WorkflowCell
                    label={reactivation.workflow.columns[1]}
                    value={row.audience}
                  />
                  <WorkflowArrow />
                  <WorkflowCell
                    label={reactivation.workflow.columns[2]}
                    value={row.message}
                  />
                  <WorkflowArrow />
                  <WorkflowCell
                    label={reactivation.workflow.columns[3]}
                    value={row.destination}
                    tone='destination'
                  />
                </div>
              ))}
            </div>
          </div>

          <div className='mt-5 grid gap-3 sm:grid-cols-2 lg:absolute lg:-bottom-8 lg:left-8 lg:right-8 lg:grid-cols-3 lg:gap-4'>
            {reactivation.outputs.map(output => {
              const Icon = OUTPUT_ICONS[output.id];

              return (
                <article
                  key={output.id}
                  className='rounded-[1.35rem] border border-white/8 bg-[#0b0d11]/88 px-4 py-4 shadow-[0_20px_60px_rgba(0,0,0,0.26)] backdrop-blur-xl'
                >
                  <div className='flex items-center justify-between gap-3'>
                    <p className='text-[11px] font-semibold uppercase tracking-[0.18em] text-white/64'>
                      {output.label}
                    </p>
                    <Icon className='h-4 w-4 text-white/55' strokeWidth={1.9} />
                  </div>
                  <p className='mt-3 text-[1.05rem] font-semibold leading-[1.2] tracking-[-0.03em] text-primary-token'>
                    {output.title}
                  </p>
                  <div className='mt-3 flex items-center justify-between gap-3 text-[12px] text-white/54'>
                    <span>{output.detail}</span>
                    <span className='rounded-full bg-white/[0.06] px-3 py-1 font-medium text-white/72'>
                      {output.destination}
                    </span>
                  </div>
                </article>
              );
            })}
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
  tone?: 'default' | 'destination';
  value: string;
}>) {
  return (
    <div className='grid gap-1 lg:gap-0'>
      <p className='text-[10px] font-semibold uppercase tracking-[0.2em] text-white/34 lg:hidden'>
        {label}
      </p>
      <p
        className={
          tone === 'destination'
            ? 'text-[15px] font-semibold tracking-[-0.03em] text-white'
            : 'text-[15px] font-semibold tracking-[-0.03em] text-white/88'
        }
      >
        {value}
      </p>
    </div>
  );
}

function WorkflowArrow() {
  return (
    <div className='hidden items-center justify-center lg:flex'>
      <ArrowRight className='h-4 w-4 text-white/28' strokeWidth={1.8} />
    </div>
  );
}
