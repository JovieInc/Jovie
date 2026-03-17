'use client';

import { Check, ChevronRight, Mail, Zap } from 'lucide-react';
import { Container } from '@/components/site/Container';

/* ------------------------------------------------------------------ */
/*  "Old way" Mailchimp steps — shown faded with strikethrough          */
/* ------------------------------------------------------------------ */

const OLD_WAY_STEPS = [
  'Import contact list',
  'Pick a template',
  'Write subject line',
  'Design the email',
  'Schedule send time',
  'Hit send & pray',
] as const;

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

export function ReleaseNotificationsSection() {
  return (
    <section className='section-spacing-linear relative overflow-hidden bg-[var(--linear-bg-page)]'>
      {/* Ambient glow — warm tint for this section */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2'
        style={{
          width: '800px',
          height: '600px',
          borderRadius: '50%',
          background:
            'radial-gradient(ellipse at center, oklch(22% 0.04 75 / 0.15), transparent 65%)',
        }}
      />

      <Container size='homepage'>
        <div className='relative mx-auto max-w-[var(--linear-content-max)]'>
          {/* ── Desktop: side-by-side · Mobile: stacked ── */}
          <div className='grid lg:grid-cols-[0.4fr_0.6fr] gap-12 lg:gap-16 lg:items-start'>
            {/* ─── Left column: copy + stat ─── */}
            <div className='flex flex-col reveal-on-scroll'>
              <span className='inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium tracking-[-0.01em] text-[color:var(--linear-text-tertiary)] border border-[var(--linear-border-subtle)]'>
                <Zap className='h-3 w-3' aria-hidden='true' />
                Automatic
              </span>

              <h2 className='mt-5 marketing-h2-linear text-[color:var(--linear-text-primary)]'>
                New release?
                <br />
                Your fans already know.
              </h2>

              <p className='mt-5 marketing-lead-linear text-[color:var(--linear-text-secondary)] max-w-md'>
                Jovie watches your Spotify catalog. The moment a new song drops,
                every fan on your list gets a beautiful email with one-tap
                listen &mdash; automatically. No templates. No scheduling. No
                Mailchimp.
              </p>

              {/* Stat card */}
              <div
                className='mt-8 flex items-center gap-3 rounded-xl px-5 py-4 w-fit'
                style={{
                  border: '1px solid var(--linear-border-subtle)',
                  backgroundColor: 'var(--linear-bg-surface-0)',
                }}
              >
                <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--linear-bg-surface-2)]'>
                  <Mail
                    className='h-4 w-4 text-[color:var(--linear-text-secondary)]'
                    aria-hidden='true'
                  />
                </div>
                <div>
                  <p className='text-[var(--linear-caption-size)] font-[number:var(--linear-font-weight-medium)] text-[color:var(--linear-text-primary)]'>
                    4,218 fans notified
                  </p>
                  <p className='text-[var(--linear-label-size)] text-[color:var(--linear-text-tertiary)]'>
                    Zero emails written
                  </p>
                </div>
              </div>
            </div>

            {/* ─── Right column: Mailchimp contrast ─── */}
            <div className='relative reveal-on-scroll' data-delay='80'>
              <div
                className='relative grid grid-cols-[1fr_auto_1fr] gap-0 overflow-hidden rounded-xl md:rounded-2xl'
                style={{
                  border: '1px solid var(--linear-border-subtle)',
                  backgroundColor: 'var(--linear-bg-surface-0)',
                  boxShadow: 'var(--linear-shadow-card-elevated)',
                }}
              >
                {/* Shine border overlay */}
                <div
                  aria-hidden='true'
                  className='pointer-events-none absolute inset-0 rounded-xl md:rounded-2xl z-10'
                  style={{ border: '1px solid rgba(255,255,255,0.04)' }}
                />
                {/* Top edge highlight */}
                <div
                  aria-hidden='true'
                  className='pointer-events-none absolute inset-x-0 top-0 h-px z-10'
                  style={{
                    background:
                      'linear-gradient(90deg, transparent, rgba(255,255,255,0.08) 30%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.08) 70%, transparent)',
                  }}
                />
                {/* ── Left half: The Old Way (faded) ── */}
                <div className='relative px-5 sm:px-6 py-6 sm:py-8 opacity-[0.38]'>
                  <p className='text-[11px] font-medium uppercase tracking-[0.08em] text-[color:var(--linear-text-tertiary)] mb-5'>
                    The old way
                  </p>
                  <div className='space-y-2.5'>
                    {OLD_WAY_STEPS.map((step, i) => (
                      <div key={step} className='flex items-center gap-2.5'>
                        <span className='flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-medium text-[color:var(--linear-text-quaternary)] bg-[var(--linear-bg-surface-2)]'>
                          {i + 1}
                        </span>
                        <span className='text-[13px] text-[color:var(--linear-text-tertiary)] line-through decoration-[var(--linear-text-quaternary)]'>
                          {step}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Center divider with "vs" ── */}
                <div className='relative flex flex-col items-center'>
                  <div
                    className='w-px flex-1'
                    style={{
                      background:
                        'linear-gradient(to bottom, transparent, var(--linear-border-default) 20%, var(--linear-border-default) 80%, transparent)',
                    }}
                  />
                  <span className='absolute top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold uppercase tracking-wider text-[color:var(--linear-text-quaternary)] bg-[var(--linear-bg-surface-2)] border border-[var(--linear-border-subtle)]'>
                    vs
                  </span>
                </div>

                {/* ── Right half: Jovie auto-email (bright) ── */}
                <div className='relative px-5 sm:px-6 py-6 sm:py-8'>
                  <p className='text-[11px] font-medium uppercase tracking-[0.08em] text-[color:var(--linear-text-tertiary)] mb-5'>
                    Jovie
                  </p>

                  {/* Email notification card */}
                  <div
                    className='relative overflow-hidden rounded-xl'
                    style={{
                      backgroundColor: 'var(--linear-bg-surface-1)',
                      border: '1px solid var(--linear-border-subtle)',
                    }}
                  >
                    {/* Email header */}
                    <div className='flex items-center gap-2.5 px-4 py-3 border-b border-[var(--linear-border-subtle)]'>
                      <div className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-500/80 to-teal-500/60'>
                        <Zap
                          className='h-3 w-3 text-white'
                          aria-hidden='true'
                        />
                      </div>
                      <div className='min-w-0 flex-1'>
                        <p className='text-[12px] font-medium text-[color:var(--linear-text-primary)] truncate'>
                          New Release from Tim White
                        </p>
                        <p className='text-[10px] text-[color:var(--linear-text-quaternary)]'>
                          via Jovie &middot; just now
                        </p>
                      </div>
                    </div>

                    {/* Email body */}
                    <div className='px-4 py-4'>
                      <div className='flex gap-3'>
                        {/* Album art placeholder */}
                        <div
                          className='h-14 w-14 shrink-0 rounded-lg'
                          style={{
                            background:
                              'linear-gradient(135deg, oklch(55% 0.15 75), oklch(50% 0.12 195))',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                          }}
                        />
                        <div className='min-w-0 flex-1'>
                          <div className='flex items-center gap-2'>
                            <p className='text-[13px] font-semibold text-[color:var(--linear-text-primary)] truncate'>
                              The Deep End
                            </p>
                            <span className='shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider bg-amber-500/15 text-amber-400'>
                              New
                            </span>
                          </div>
                          <p className='text-[12px] text-[color:var(--linear-text-tertiary)] mt-0.5'>
                            Tim White
                          </p>
                        </div>
                      </div>

                      {/* Listen Now button */}
                      <button
                        type='button'
                        className='mt-4 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold transition-colors duration-[var(--linear-duration-normal)] ease-[var(--linear-ease)]'
                        style={{
                          background:
                            'linear-gradient(135deg, oklch(72% 0.16 75), oklch(68% 0.14 60))',
                          color: 'oklch(18% 0.01 75)',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                        }}
                        tabIndex={-1}
                        aria-hidden='true'
                      >
                        Listen Now
                        <ChevronRight className='h-3.5 w-3.5' />
                      </button>
                    </div>

                    {/* Footer */}
                    <div className='px-4 py-2.5 border-t border-[var(--linear-border-subtle)]'>
                      <p className='text-[10px] text-[color:var(--linear-text-quaternary)] text-center'>
                        Sent automatically by Jovie
                      </p>
                    </div>
                  </div>

                  {/* Delivered badge */}
                  <div className='mt-3 flex items-center justify-center gap-1.5'>
                    <span className='flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/20'>
                      <Check
                        className='h-2.5 w-2.5 text-emerald-400'
                        aria-hidden='true'
                      />
                    </span>
                    <span className='text-[11px] font-medium text-emerald-400/90'>
                      Delivered to 4,218 fans
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
