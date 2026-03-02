import { Bolt, Check, ChevronRight, Disc, Link } from 'lucide-react';
import Image from 'next/image';

import { Container } from '@/components/site/Container';
import type { SmartlinkThreadItem } from './demo/mock-data';
import { SMARTLINK_KANBAN_COLUMNS, SMARTLINK_THREAD } from './demo/mock-data';

/* ------------------------------------------------------------------ */
/*  DSP icon paths (subset from DspLogo for the demo)                  */
/* ------------------------------------------------------------------ */
const DEMO_DSPS = [
  {
    name: 'Spotify',
    color: '#1DB954',
    iconPath:
      'M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.48.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.32 11.28-1.08 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z',
  },
  {
    name: 'Apple Music',
    color: '#FA243C',
    iconPath:
      'M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 00-1.877-.726 10.496 10.496 0 00-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026-.747.043-1.49.123-2.193.4-1.336.53-2.3 1.452-2.865 2.78-.192.448-.292.925-.363 1.408-.056.392-.088.785-.1 1.18 0 .032-.007.062-.01.093v12.223c.01.14.017.283.027.424.05.815.154 1.624.497 2.373.65 1.42 1.738 2.353 3.234 2.801.42.127.856.187 1.293.228.555.053 1.11.06 1.667.06h11.03a12.5 12.5 0 001.57-.1c.822-.106 1.596-.35 2.295-.81a5.046 5.046 0 001.88-2.207c.186-.42.293-.87.37-1.324.113-.675.138-1.358.137-2.04-.002-3.8 0-7.595-.003-11.393zm-6.423 3.99v5.712c0 .417-.058.827-.244 1.206-.29.59-.76.962-1.388 1.14-.35.1-.706.157-1.07.173-.95.045-1.773-.6-1.943-1.536a1.88 1.88 0 011.038-2.022c.323-.16.67-.25 1.018-.324.378-.082.758-.153 1.134-.24.274-.063.457-.23.51-.516a.904.904 0 00.02-.193c0-1.815 0-3.63-.002-5.443a.725.725 0 00-.026-.185c-.04-.15-.15-.243-.304-.234-.16.01-.318.035-.475.066-.76.15-1.52.303-2.28.456l-2.325.47-1.374.278c-.016.003-.032.01-.048.013-.277.077-.377.203-.39.49-.002.042 0 .086 0 .13-.002 2.602 0 5.204-.003 7.805 0 .42-.047.836-.215 1.227-.278.64-.77 1.04-1.434 1.233-.35.1-.71.16-1.075.172-.96.036-1.755-.6-1.92-1.544-.14-.812.23-1.685 1.154-2.075.357-.15.73-.232 1.108-.31.287-.06.575-.116.86-.177.383-.083.583-.323.6-.714v-.15c0-2.96 0-5.922.002-8.882 0-.123.013-.25.042-.37.07-.285.273-.448.546-.518.255-.066.515-.112.774-.165.733-.15 1.466-.296 2.2-.444l2.27-.46c.67-.134 1.34-.27 2.01-.403.22-.043.442-.088.663-.106.31-.025.523.17.554.482.008.073.012.148.012.223.002 1.91.002 3.822 0 5.732z',
  },
  {
    name: 'YouTube Music',
    color: '#FF0000',
    iconPath:
      'M12 0C5.376 0 0 5.376 0 12s5.376 12 12 12 12-5.376 12-12S18.624 0 12 0zm0 19.104c-3.924 0-7.104-3.18-7.104-7.104S8.076 4.896 12 4.896s7.104 3.18 7.104 7.104-3.18 7.104-7.104 7.104zm0-13.332c-3.432 0-6.228 2.796-6.228 6.228S8.568 18.228 12 18.228 18.228 15.432 18.228 12 15.432 5.772 12 5.772zM9.684 15.54V8.46L15.816 12l-6.132 3.54z',
  },
];

export function AutomaticReleaseSmartlinksSection() {
  return (
    <section className='section-spacing-linear overflow-hidden bg-[var(--linear-bg-page)]'>
      <Container size='homepage'>
        <div className='mx-auto max-w-[var(--linear-content-max)]'>
          {/* Two-column header */}
          <div className='grid md:grid-cols-2 md:items-start section-gap-linear'>
            <h2 className='max-w-md marketing-h2-linear text-[var(--linear-text-primary)]'>
              Automatic links.
              <br />
              Instant notifications.
            </h2>
            <div className='max-w-lg'>
              <p className='marketing-lead-linear text-[var(--linear-text-secondary)]'>
                Sync your Spotify once. When new music drops, Jovie instantly
                builds a smart link and automatically notifies your fans via
                email (SMS coming soon).
              </p>
              <span className='mt-6 inline-flex items-center gap-1.5 rounded-full px-3 py-1 border transition-colors text-[var(--linear-caption-size)] font-[var(--linear-font-weight-medium)] text-[var(--linear-text-secondary)] bg-[var(--linear-bg-surface-0)] border-[var(--linear-border-subtle)]'>
                Smartlinks · Auto-generated{' '}
                <span className='text-[var(--linear-text-tertiary)]'>→</span>
              </span>
            </div>
          </div>

          {/* Full Width Product Mockup */}
          <div className='relative mt-16 md:mt-24 mx-auto w-full'>
            <div className='relative w-full'>
              {/* Left panel — Dashboard Window */}
              <div
                className='relative overflow-hidden rounded-xl md:rounded-2xl md:w-[85%]'
                style={{
                  border: '1px solid var(--linear-border-subtle)',
                  backgroundColor: 'var(--linear-bg-surface-0)',
                  boxShadow: 'var(--linear-shadow-card-elevated)',
                }}
              >
                {/* Fake Mac Header */}
                <div className='flex items-center px-5 h-12 border-b border-[var(--linear-border-subtle)] bg-[var(--linear-bg-surface-1)]'>
                  <div className='flex gap-2'>
                    <div className='w-3 h-3 rounded-full bg-[#ED6A5E] border border-black/10' />
                    <div className='w-3 h-3 rounded-full bg-[#F4BF4F] border border-black/10' />
                    <div className='w-3 h-3 rounded-full bg-[#61C554] border border-black/10' />
                  </div>
                </div>

                <div className='grid md:grid-cols-[1fr_1.1fr]'>
                  {/* Left panel — Activity thread */}
                  <ActivityThread />

                  {/* Right panel — Release kanban */}
                  <ReleaseKanban />
                </div>

                {/* Bottom gradient fade */}
                <div className='pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-linear-to-t from-[var(--linear-bg-surface-0)] to-transparent' />
              </div>

              {/* Right panel — Floating Smart Link Page (matches ReleaseLandingPage) */}
              <div
                className='absolute z-10 hidden md:flex flex-col right-0 bottom-[-15%] overflow-hidden'
                style={{
                  width: '320px',
                  borderRadius: '16px',
                  backgroundColor: 'hsl(var(--base))',
                  border: '1px solid hsl(var(--border))',
                  boxShadow:
                    '0 25px 50px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)',
                }}
              >
                {/* Ambient glow — matches real smart link page */}
                <div className='pointer-events-none absolute inset-0'>
                  <div
                    className='absolute left-1/2 top-[20%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[80px]'
                    style={{
                      width: '200px',
                      height: '200px',
                      background: 'hsl(var(--foreground) / 0.04)',
                    }}
                  />
                </div>

                <div className='relative p-5 flex flex-col items-center'>
                  {/* Album artwork — matches real page: rounded-lg, shadow, ring */}
                  <div className='relative w-full aspect-square overflow-hidden rounded-lg shadow-2xl shadow-black/40 ring-1 ring-[hsl(var(--border))]'>
                    <Image
                      src='https://f4.bcbits.com/img/a0491039755_10.jpg'
                      alt='The Deep End - Cosmic Gate & Tim White'
                      className='object-cover'
                      fill
                      sizes='280px'
                      unoptimized
                    />
                  </div>

                  {/* Release info — matches real page typography */}
                  <div className='mt-4 w-full text-center'>
                    <h3 className='text-lg font-semibold leading-snug tracking-tight text-[hsl(var(--foreground))]'>
                      The Deep End
                    </h3>
                    <p className='mt-1 text-sm text-[hsl(var(--muted-foreground))]'>
                      Cosmic Gate & Tim White
                    </p>
                  </div>

                  {/* Platform buttons — matches ReleaseLandingPage styling */}
                  <div className='mt-5 w-full space-y-2'>
                    {DEMO_DSPS.map(dsp => (
                      <div
                        key={dsp.name}
                        className='group flex w-full items-center gap-3.5 rounded-xl px-4 py-3 ring-1 ring-inset backdrop-blur-sm transition-all duration-150 ease-out cursor-pointer'
                        style={
                          {
                            backgroundColor: 'hsl(var(--surface-1) / 0.7)',
                            '--tw-ring-color': 'hsl(var(--border))',
                          } as React.CSSProperties
                        }
                      >
                        <svg
                          viewBox='0 0 24 24'
                          fill='currentColor'
                          className='h-5 w-5 shrink-0 transition-colors duration-150'
                          style={{ color: 'hsl(var(--muted-foreground))' }}
                          aria-hidden='true'
                        >
                          <path d={dsp.iconPath} />
                        </svg>
                        <span className='flex-1 text-base font-semibold text-[hsl(var(--foreground))]'>
                          {dsp.name}
                        </span>
                        <ChevronRight
                          className='h-4 w-4'
                          style={{
                            color: 'hsl(var(--muted-foreground) / 0.7)',
                          }}
                          aria-hidden='true'
                        />
                      </div>
                    ))}
                  </div>

                  {/* Powered by Jovie — matches real page footer */}
                  <div className='mt-4 text-center'>
                    <span
                      className='inline-flex items-center gap-1 uppercase tracking-widest'
                      style={{
                        fontSize: '10px',
                        color: 'hsl(var(--muted-foreground) / 0.7)',
                      }}
                    >
                      <span>Powered by</span>
                      <span className='font-semibold'>Jovie</span>
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

function ActivityThread() {
  return (
    <div className='flex flex-col border-r border-[var(--linear-border-subtle)] bg-[var(--linear-bg-surface-0)]'>
      {/* Title bar */}
      <div className='flex items-center gap-2 border-b border-[var(--linear-border-subtle)] px-5 py-3'>
        <span className='text-[var(--linear-caption-size)] font-[var(--linear-font-weight-medium)] text-[var(--linear-text-primary)]'>
          Activity
        </span>
        <span className='text-[var(--linear-caption-size)] text-[var(--linear-text-tertiary)]'>
          · Release automation
        </span>
      </div>

      {/* Thread items */}
      <div className='flex-1 space-y-1 px-3 py-3'>
        {SMARTLINK_THREAD.map(item => (
          <div
            key={item.id}
            className='flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-[var(--linear-bg-hover)]'
          >
            {/* Icon */}
            <span className='mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[var(--linear-bg-surface-2)]'>
              <ThreadIcon type={item.iconType} color={item.iconColor} />
            </span>

            <div className='min-w-0 flex-1'>
              <div className='flex items-baseline justify-between gap-2'>
                <p className='truncate text-[var(--linear-caption-size)] font-[var(--linear-font-weight-medium)] text-[var(--linear-text-primary)]'>
                  {item.label}
                </p>
                <span className='flex-shrink-0 text-[var(--linear-label-size)] text-[var(--linear-text-tertiary)]'>
                  {item.time}
                </span>
              </div>
              {item.detail && (
                <p className='mt-0.5 text-[var(--linear-label-size)] text-[var(--linear-text-secondary)] leading-[var(--linear-leading-relaxed)]'>
                  {item.detail}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Command bar */}
      <div className='border-t border-[var(--linear-border-subtle)] px-4 py-3'>
        <div
          className='flex items-center gap-2 rounded-lg px-3 py-2'
          style={{
            backgroundColor: 'var(--linear-bg-surface-1)',
            border: '1px solid var(--linear-border-subtle)',
          }}
        >
          <span
            className='rounded px-1.5 py-0.5 text-[var(--linear-label-size)] font-[var(--linear-font-weight-medium)] text-[var(--linear-accent)]'
            style={{
              backgroundColor: 'oklch(from var(--linear-accent) l c h / 0.1)',
            }}
          >
            @jovie
          </span>
          <span className='text-[var(--linear-caption-size)] text-[var(--linear-text-tertiary)]'>
            create smartlink for upcoming release
          </span>
        </div>
      </div>
    </div>
  );
}

function getStatusColor(status: string): string {
  if (status === 'Live') return 'var(--linear-success)';
  if (status === 'Syncing') return 'var(--linear-accent)';
  return 'var(--linear-text-tertiary)';
}

function getStatusBgColor(status: string): string {
  if (status === 'Live')
    return 'oklch(from var(--linear-success) l c h / 0.12)';
  if (status === 'Syncing')
    return 'oklch(from var(--linear-accent) l c h / 0.12)';
  return 'var(--linear-bg-surface-2)';
}

function ReleaseKanban() {
  return (
    <div className='bg-[var(--linear-bg-surface-1)]'>
      {/* Title bar */}
      <div className='flex items-center gap-2 border-b border-[var(--linear-border-subtle)] px-5 py-3'>
        <span className='text-[var(--linear-caption-size)] font-[var(--linear-font-weight-medium)] text-[var(--linear-text-primary)]'>
          Releases
        </span>
        <span className='rounded-full px-2 py-0.5 text-[var(--linear-label-size)] font-[var(--linear-font-weight-medium)] text-[var(--linear-text-secondary)] bg-[var(--linear-bg-surface-2)]'>
          4
        </span>
      </div>

      {/* Columns */}
      <div className='grid grid-cols-3 gap-px p-3'>
        {SMARTLINK_KANBAN_COLUMNS.map(column => (
          <div key={column.title} className='flex flex-col gap-2 px-1.5'>
            {/* Column header */}
            <div className='flex items-center justify-between px-1 py-1.5'>
              <span className='text-[var(--linear-label-size)] font-[var(--linear-font-weight-medium)] tracking-[0.05em] uppercase text-[var(--linear-text-tertiary)]'>
                {column.title}
              </span>
              <span className='text-[var(--linear-label-size)] text-[var(--linear-text-tertiary)]'>
                {column.cards.length}
              </span>
            </div>

            {/* Cards */}
            {column.cards.map(card => (
              <div
                key={card.id}
                className='overflow-hidden rounded-lg shadow-sm transition-colors hover:bg-[var(--linear-bg-hover)] cursor-default'
                style={{
                  border: '1px solid var(--linear-border-subtle)',
                  backgroundColor: 'var(--linear-bg-surface-0)',
                }}
              >
                {/* Artwork */}
                <div
                  className='h-16 w-full'
                  style={{ background: card.gradient }}
                />

                <div className='space-y-1.5 px-2.5 py-2'>
                  <p className='truncate text-[var(--linear-caption-size)] font-[var(--linear-font-weight-medium)] text-[var(--linear-text-primary)]'>
                    {card.title}
                  </p>
                  <p className='truncate text-[var(--linear-label-size)] text-[var(--linear-text-tertiary)]'>
                    {card.artist}
                  </p>

                  <div className='flex items-center justify-between'>
                    <span className='text-[10px] text-[var(--linear-text-tertiary)]'>
                      {card.platformCount} platforms
                    </span>
                    <span
                      className='rounded-full px-1.5 py-0.5'
                      style={{
                        fontSize: '10px',
                        fontWeight: 'var(--linear-font-weight-medium)',
                        color: getStatusColor(card.status),
                        backgroundColor: getStatusBgColor(card.status),
                      }}
                    >
                      {card.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ThreadIcon({
  type,
  color,
}: {
  readonly type: SmartlinkThreadItem['iconType'];
  readonly color: string;
}) {
  const icons = {
    link: Link,
    disc: Disc,
    zap: Bolt,
    check: Check,
  } as const;

  const Icon = icons[type];
  return <Icon aria-hidden='true' className='h-3 w-3' style={{ color }} />;
}
