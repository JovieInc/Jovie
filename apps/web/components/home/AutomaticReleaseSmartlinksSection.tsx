import { Bolt, Check, Disc, Link, Music, Youtube } from 'lucide-react';
import Image from 'next/image';

import { Container } from '@/components/site/Container';
import type { SmartlinkThreadItem } from './demo/mock-data';
import { SMARTLINK_KANBAN_COLUMNS, SMARTLINK_THREAD } from './demo/mock-data';

export function AutomaticReleaseSmartlinksSection() {
  return (
    <section
      className='section-spacing-linear overflow-hidden pb-32 md:pb-48'
      style={{ backgroundColor: 'var(--linear-bg-page)' }}
    >
      <Container size='homepage'>
        <div className='mx-auto max-w-6xl'>
          {/* Two-column header */}
          <div className='grid gap-6 md:grid-cols-2 md:items-start'>
            <h2
              className='max-w-md'
              style={{
                color: 'var(--linear-text-primary)',
                fontSize: 'clamp(28px, 4vw, 48px)',
                fontWeight: 510,
                letterSpacing: '-0.022em',
                lineHeight: 1,
              }}
            >
              Smart links for
              <br />
              every release.
            </h2>
            <div className='max-w-lg'>
              <p
                style={{
                  color: 'var(--linear-text-secondary)',
                  fontSize: '15px',
                  lineHeight: '24px',
                  letterSpacing: '-0.011em',
                }}
              >
                Connect your Spotify and Jovie instantly creates a polished
                release smartlink — populated with platform destinations,
                artwork, and metadata your fans can trust.
              </p>
              <span
                className='mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1'
                style={{
                  fontSize: '13px',
                  fontWeight: 510,
                  color: 'var(--linear-text-secondary)',
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.05)',
                }}
              >
                Smartlinks · Auto-generated{' '}
                <span style={{ color: 'var(--linear-text-tertiary)' }}>→</span>
              </span>
            </div>
          </div>

          {/* Full Width Product Mockup */}
          <div className='relative mt-20 mx-auto w-full max-w-[1320px] px-4 sm:px-6 lg:px-8'>
            <div className='relative w-full'>
              {/* Left panel — Dashboard Window */}
              <div
                className='relative overflow-hidden rounded-xl md:rounded-2xl md:w-[85%]'
                style={{
                  border: '1px solid rgba(255,255,255,0.08)',
                  backgroundColor: 'rgba(10, 14, 24, 0.95)',
                  boxShadow:
                    '0 0 0 1px rgba(0,0,0,0.5), 0 30px 60px -12px rgba(0,0,0,0.8), 0 50px 100px -20px rgba(0,0,0,0.8)',
                }}
              >
                {/* Fake Mac Header */}
                <div
                  className='flex items-center px-5 h-12 border-b'
                  style={{
                    borderColor: 'rgba(255,255,255,0.06)',
                    backgroundColor: 'rgba(255,255,255,0.02)',
                  }}
                >
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
                <div className='pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[rgba(10,14,24,1)] to-transparent' />
              </div>

              {/* Right panel — Floating Release Page */}
              <div
                className='absolute z-10 hidden md:flex flex-col right-0 bottom-[-20%]'
                style={{
                  width: '360px',
                  borderRadius: '24px',
                  backgroundColor: 'rgba(22, 23, 26, 0.75)',
                  backdropFilter: 'blur(24px)',
                  WebkitBackdropFilter: 'blur(24px)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  boxShadow:
                    '0 0 0 1px rgba(255,255,255,0.05), 0 40px 80px -10px rgba(0,0,0,0.9), 0 0 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
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
                    <h3 className='text-white font-semibold text-2xl mb-1 tracking-tight'>
                      The Deep End
                    </h3>
                    <p className='text-[var(--linear-text-tertiary)] text-[15px]'>
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
        backgroundColor: 'transparent',
      }}
    >
      {/* Title bar */}
      <div
        className='flex items-center gap-2 border-b px-5 py-3'
        style={{ borderColor: 'var(--linear-border-subtle)' }}
      >
        <span
          style={{
            fontSize: '13px',
            fontWeight: 510,
            color: 'var(--linear-text-primary)',
          }}
        >
          Activity
        </span>
        <span
          style={{
            fontSize: '13px',
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
            className='flex items-start gap-3 rounded-lg px-3 py-2.5'
            style={{ backgroundColor: 'transparent' }}
          >
            {/* Icon */}
            <span
              className='mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full'
              style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
            >
              <ThreadIcon type={item.iconType} color={item.iconColor} />
            </span>

            <div className='min-w-0 flex-1'>
              <div className='flex items-baseline justify-between gap-2'>
                <p
                  className='truncate'
                  style={{
                    fontSize: '13px',
                    fontWeight: 450,
                    color: 'var(--linear-text-primary)',
                  }}
                >
                  {item.label}
                </p>
                <span
                  className='flex-shrink-0'
                  style={{
                    fontSize: '11px',
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
                    fontSize: '12px',
                    color: 'var(--linear-text-tertiary)',
                    lineHeight: '18px',
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
            backgroundColor: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <span
            className='rounded px-1.5 py-0.5'
            style={{
              fontSize: '11px',
              fontWeight: 510,
              color: 'var(--linear-accent, #6C7AFF)',
              backgroundColor: 'rgba(108, 122, 255, 0.1)',
            }}
          >
            @jovie
          </span>
          <span
            style={{
              fontSize: '13px',
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
  if (status === 'Live') return '#4EC98C';
  if (status === 'Syncing') return '#6C7AFF';
  return 'var(--linear-text-tertiary)';
}

function getStatusBgColor(status: string): string {
  if (status === 'Live') return 'rgba(78, 201, 140, 0.12)';
  if (status === 'Syncing') return 'rgba(108, 122, 255, 0.12)';
  return 'rgba(255,255,255,0.05)';
}

function ReleaseKanban() {
  return (
    <div style={{ backgroundColor: 'transparent' }}>
      {/* Title bar */}
      <div
        className='flex items-center gap-2 border-b px-5 py-3'
        style={{ borderColor: 'var(--linear-border-subtle)' }}
      >
        <span
          style={{
            fontSize: '13px',
            fontWeight: 510,
            color: 'var(--linear-text-primary)',
          }}
        >
          Releases
        </span>
        <span
          className='rounded-full px-2 py-0.5'
          style={{
            fontSize: '10px',
            fontWeight: 510,
            color: 'var(--linear-text-secondary)',
            backgroundColor: 'rgba(255,255,255,0.05)',
          }}
        >
          4
        </span>
      </div>

      {/* Columns */}
      <div className='grid grid-cols-3 gap-px p-3'>
        {SMARTLINK_KANBAN_COLUMNS.map(column => (
          <div key={column.title} className='flex flex-col gap-2 px-1.5'>
            {/* Column header */}
            <div className='flex items-center justify-between px-1 py-1.5'>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 510,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  color: 'var(--linear-text-tertiary)',
                }}
              >
                {column.title}
              </span>
              <span
                style={{
                  fontSize: '11px',
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
                className='overflow-hidden rounded-lg'
                style={{
                  border: '1px solid rgba(255,255,255,0.05)',
                  backgroundColor: 'rgba(255,255,255,0.02)',
                }}
              >
                {/* Artwork */}
                <div
                  className='h-16 w-full'
                  style={{ background: card.gradient }}
                />

                <div className='space-y-1.5 px-2.5 py-2'>
                  <p
                    className='truncate'
                    style={{
                      fontSize: '12px',
                      fontWeight: 500,
                      color: 'var(--linear-text-primary)',
                    }}
                  >
                    {card.title}
                  </p>
                  <p
                    className='truncate'
                    style={{
                      fontSize: '11px',
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
                        fontWeight: 510,
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
      className='w-full flex items-center justify-between p-3.5 rounded-xl transition-colors hover:bg-white/5 cursor-pointer group'
      style={{
        backgroundColor: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div className='flex items-center gap-3.5'>
        <div className='w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center group-hover:bg-white/15 transition-colors'>
          <IconComponent className='w-4 h-4 text-white/80' />
        </div>
        <span className='text-[15px] font-medium text-white tracking-tight'>
          {platform}
        </span>
      </div>
      <button
        type='button'
        className='px-4 py-1.5 rounded-full text-[13px] font-semibold bg-white text-black hover:bg-white/90 transition-colors'
      >
        Play
      </button>
    </div>
  );
}
