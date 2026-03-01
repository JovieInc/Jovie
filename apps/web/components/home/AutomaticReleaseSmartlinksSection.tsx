import { Bolt, Check, Disc, Link, Music, Youtube } from 'lucide-react';
import Image from 'next/image';

import { Container } from '@/components/site/Container';
import type { SmartlinkThreadItem } from './demo/mock-data';
import { SMARTLINK_KANBAN_COLUMNS, SMARTLINK_THREAD } from './demo/mock-data';

export function AutomaticReleaseSmartlinksSection() {
  return (
    <section
      className='section-spacing-linear overflow-hidden'
      style={{ backgroundColor: 'var(--linear-bg-page)' }}
    >
      <Container size='homepage'>
        <div className='mx-auto max-w-[var(--linear-content-max)]'>
          {/* Two-column header */}
          <div className='grid md:grid-cols-2 md:items-start section-gap-linear'>
            <h2 className='max-w-md marketing-h2-linear text-[var(--linear-text-primary)]'>
              Smart links for
              <br />
              every release.
            </h2>
            <div className='max-w-lg'>
              <p className='marketing-lead-linear text-[var(--linear-text-secondary)]'>
                Connect your Spotify and Jovie instantly creates a polished
                release smartlink — populated with platform destinations,
                artwork, and metadata your fans can trust.
              </p>
              <span
                className='mt-6 inline-flex items-center gap-1.5 rounded-full px-3 py-1 border transition-colors'
                style={{
                  fontSize: 'var(--linear-caption-size)',
                  fontWeight: 'var(--linear-font-weight-medium)',
                  color: 'var(--linear-text-secondary)',
                  backgroundColor: 'var(--linear-bg-surface-0)',
                  borderColor: 'var(--linear-border-subtle)',
                }}
              >
                Smartlinks · Auto-generated{' '}
                <span style={{ color: 'var(--linear-text-tertiary)' }}>→</span>
              </span>
            </div>
          </div>

          {/* Full Width Product Mockup */}
          <div className='relative mt-10 md:mt-24 mx-auto w-full'>
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
                <div
                  className='flex items-center px-5 h-12 border-b'
                  style={{
                    borderColor: 'var(--linear-border-subtle)',
                    backgroundColor: 'var(--linear-bg-surface-1)',
                  }}
                >
                  <div className='flex gap-2'>
                    <div className='w-3 h-3 rounded-full bg-[#ED6A5E] border border-black/10' />
                    <div className='w-3 h-3 rounded-full bg-[#F4BF4F] border border-black/10' />
                    <div className='w-3 h-3 rounded-full bg-[#61C554] border border-black/10' />
                  </div>
                </div>

                <div className='grid grid-cols-1 md:grid-cols-[1fr_1.1fr]'>
                  {/* Left panel — Activity thread (hidden on mobile to keep section compact) */}
                  <div className='hidden md:block'>
                    <ActivityThread />
                  </div>

                  {/* Right panel — Release kanban */}
                  <ReleaseKanban />
                </div>

                {/* Bottom gradient fade */}
                <div className='pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-linear-to-t from-[var(--linear-bg-surface-0)] to-transparent' />
              </div>

              {/* Right panel — Floating Release Page */}
              <div
                className='absolute z-10 hidden md:flex flex-col right-0 bottom-[-15%]'
                style={{
                  width: '360px',
                  borderRadius: 'var(--linear-radius-lg)',
                  backgroundColor: 'var(--linear-bg-surface-1)',
                  backdropFilter: 'blur(24px)',
                  WebkitBackdropFilter: 'blur(24px)',
                  border: '1px solid var(--linear-border-strong)',
                  boxShadow: 'var(--linear-shadow-card-elevated)',
                }}
              >
                <div className='p-6 flex flex-col items-center'>
                  <div className='w-full aspect-square rounded-xl mb-6 shadow-lg relative overflow-hidden'>
                    <div className='absolute inset-0 bg-linear-to-br from-[#1c1c1c] to-[#0a0a0a]' />
                    <Image
                      src='https://f4.bcbits.com/img/a0491039755_10.jpg'
                      alt='The Deep End - Cosmic Gate & Tim White'
                      className='absolute inset-0 w-full h-full object-cover opacity-90'
                      fill
                      unoptimized
                    />
                    <div className='absolute inset-0 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)] rounded-xl' />
                  </div>

                  <div className='w-full text-center mb-6'>
                    <h3 className='text-[var(--linear-text-primary)] font-[var(--linear-font-weight-semibold)] text-[var(--linear-h3-size)] mb-1 tracking-tight'>
                      The Deep End
                    </h3>
                    <p className='text-[var(--linear-text-tertiary)] text-[var(--linear-body-size)]'>
                      Cosmic Gate & Tim White
                    </p>
                  </div>

                  <div className='w-full space-y-3'>
                    <PlatformButton platform='Spotify' icon={Disc} />
                    <PlatformButton platform='Apple Music' icon={Music} />
                    <PlatformButton platform='YouTube' icon={Youtube} />
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
    <div
      className='flex flex-col border-r'
      style={{
        borderColor: 'var(--linear-border-subtle)',
        backgroundColor: 'var(--linear-bg-surface-0)',
      }}
    >
      {/* Title bar */}
      <div
        className='flex items-center gap-2 border-b px-5 py-3'
        style={{ borderColor: 'var(--linear-border-subtle)' }}
      >
        <span
          style={{
            fontSize: 'var(--linear-caption-size)',
            fontWeight: 'var(--linear-font-weight-medium)',
            color: 'var(--linear-text-primary)',
          }}
        >
          Activity
        </span>
        <span
          style={{
            fontSize: 'var(--linear-caption-size)',
            color: 'var(--linear-text-tertiary)',
          }}
        >
          · Release automation
        </span>
      </div>

      {/* Thread items */}
      <div className='flex-1 space-y-1 px-3 py-3'>
        {SMARTLINK_THREAD.map(item => (
          <div
            key={item.id}
            className='flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-[var(--linear-bg-hover)]'
            style={{ backgroundColor: 'transparent' }}
          >
            {/* Icon */}
            <span
              className='mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full'
              style={{ backgroundColor: 'var(--linear-bg-surface-2)' }}
            >
              <ThreadIcon type={item.iconType} color={item.iconColor} />
            </span>

            <div className='min-w-0 flex-1'>
              <div className='flex items-baseline justify-between gap-2'>
                <p
                  className='truncate'
                  style={{
                    fontSize: 'var(--linear-caption-size)',
                    fontWeight: 'var(--linear-font-weight-medium)',
                    color: 'var(--linear-text-primary)',
                  }}
                >
                  {item.label}
                </p>
                <span
                  className='flex-shrink-0'
                  style={{
                    fontSize: 'var(--linear-label-size)',
                    color: 'var(--linear-text-tertiary)',
                  }}
                >
                  {item.time}
                </span>
              </div>
              {item.detail && (
                <p
                  className='mt-0.5'
                  style={{
                    fontSize: 'var(--linear-label-size)',
                    color: 'var(--linear-text-secondary)',
                    lineHeight: 'var(--linear-leading-relaxed)',
                  }}
                >
                  {item.detail}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Command bar */}
      <div
        className='border-t px-4 py-3'
        style={{ borderColor: 'var(--linear-border-subtle)' }}
      >
        <div
          className='flex items-center gap-2 rounded-lg px-3 py-2'
          style={{
            backgroundColor: 'var(--linear-bg-surface-1)',
            border: '1px solid var(--linear-border-subtle)',
          }}
        >
          <span
            className='rounded px-1.5 py-0.5'
            style={{
              fontSize: 'var(--linear-label-size)',
              fontWeight: 'var(--linear-font-weight-medium)',
              color: 'var(--linear-accent)',
              backgroundColor: 'oklch(from var(--linear-accent) l c h / 0.1)',
            }}
          >
            @jovie
          </span>
          <span
            style={{
              fontSize: 'var(--linear-caption-size)',
              color: 'var(--linear-text-tertiary)',
            }}
          >
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
    <div style={{ backgroundColor: 'var(--linear-bg-surface-1)' }}>
      {/* Title bar */}
      <div
        className='flex items-center gap-2 border-b px-5 py-3'
        style={{ borderColor: 'var(--linear-border-subtle)' }}
      >
        <span
          style={{
            fontSize: 'var(--linear-caption-size)',
            fontWeight: 'var(--linear-font-weight-medium)',
            color: 'var(--linear-text-primary)',
          }}
        >
          Releases
        </span>
        <span
          className='rounded-full px-2 py-0.5'
          style={{
            fontSize: 'var(--linear-label-size)',
            fontWeight: 'var(--linear-font-weight-medium)',
            color: 'var(--linear-text-secondary)',
            backgroundColor: 'var(--linear-bg-surface-2)',
          }}
        >
          4
        </span>
      </div>

      {/* Columns */}
      <div className='grid grid-cols-3 gap-px p-2 sm:p-3'>
        {SMARTLINK_KANBAN_COLUMNS.map(column => (
          <div key={column.title} className='flex flex-col gap-2 px-1.5'>
            {/* Column header */}
            <div className='flex items-center justify-between px-1 py-1.5'>
              <span
                style={{
                  fontSize: 'var(--linear-label-size)',
                  fontWeight: 'var(--linear-font-weight-medium)',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  color: 'var(--linear-text-tertiary)',
                }}
              >
                {column.title}
              </span>
              <span
                style={{
                  fontSize: 'var(--linear-label-size)',
                  color: 'var(--linear-text-tertiary)',
                }}
              >
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
                  className='h-10 sm:h-16 w-full'
                  style={{ background: card.gradient }}
                />

                <div className='space-y-1 sm:space-y-1.5 px-1.5 sm:px-2.5 py-1.5 sm:py-2'>
                  <p
                    className='truncate'
                    style={{
                      fontSize: 'var(--linear-caption-size)',
                      fontWeight: 'var(--linear-font-weight-medium)',
                      color: 'var(--linear-text-primary)',
                    }}
                  >
                    {card.title}
                  </p>
                  <p
                    className='truncate'
                    style={{
                      fontSize: 'var(--linear-label-size)',
                      color: 'var(--linear-text-tertiary)',
                    }}
                  >
                    {card.artist}
                  </p>

                  <div className='flex items-center justify-between'>
                    <span
                      style={{
                        fontSize: '10px',
                        color: 'var(--linear-text-tertiary)',
                      }}
                    >
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

function PlatformButton({
  platform,
  icon: IconComponent,
}: {
  platform: string;
  icon: React.ElementType;
}) {
  return (
    <div
      className='w-full flex items-center justify-between p-3.5 rounded-xl transition-colors hover:bg-[var(--linear-bg-hover)] cursor-pointer group'
      style={{
        backgroundColor: 'var(--linear-bg-surface-2)',
        border: '1px solid var(--linear-border-subtle)',
      }}
    >
      <div className='flex items-center gap-3.5'>
        <div
          className='w-8 h-8 rounded-lg flex items-center justify-center transition-colors'
          style={{
            backgroundColor: 'var(--linear-bg-surface-0)',
            border: '1px solid var(--linear-border-subtle)',
          }}
        >
          <IconComponent className='w-4 h-4 text-[var(--linear-text-secondary)] group-hover:text-[var(--linear-text-primary)] transition-colors' />
        </div>
        <span className='text-[var(--linear-body-size)] font-[var(--linear-font-weight-medium)] text-[var(--linear-text-primary)] tracking-tight'>
          {platform}
        </span>
      </div>
      <button
        type='button'
        className='px-4 py-1.5 rounded-full text-[var(--linear-caption-size)] font-[var(--linear-font-weight-semibold)] transition-colors'
        style={{
          backgroundColor: 'var(--linear-text-primary)',
          color: 'var(--linear-bg-page)',
        }}
      >
        Play
      </button>
    </div>
  );
}
