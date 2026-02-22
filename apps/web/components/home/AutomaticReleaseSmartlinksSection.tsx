import { Bolt, Check, Disc, Link } from 'lucide-react';

import { Container } from '@/components/site/Container';
import type { SmartlinkThreadItem } from './demo/mock-data';
import { SMARTLINK_KANBAN_COLUMNS, SMARTLINK_THREAD } from './demo/mock-data';

export function AutomaticReleaseSmartlinksSection() {
  return (
    <section
      className='section-spacing-linear'
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
              Automatic smartlinks
              <br />
              for every release.
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
                Smartlinks · Auto-generated
                <span style={{ color: 'var(--linear-text-tertiary)' }}>→</span>
              </span>
            </div>
          </div>

          {/* Two-panel product mockup */}
          <div className='relative mt-12'>
            <div
              className='relative overflow-hidden rounded-2xl'
              style={{
                border: '1px solid var(--linear-border-subtle)',
                backgroundColor: 'rgba(10, 14, 24, 0.9)',
              }}
            >
              <div className='grid md:grid-cols-[1fr_1.1fr]'>
                {/* Left panel — Activity thread */}
                <ActivityThread />

                {/* Right panel — Release kanban */}
                <ReleaseKanban />
              </div>

              {/* Bottom gradient fade */}
              <div className='pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[rgba(4,7,13,0.95)] to-transparent' />
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
        backgroundColor: 'rgba(13, 18, 28, 0.88)',
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

function ReleaseKanban() {
  return (
    <div style={{ backgroundColor: 'rgba(13, 18, 28, 0.88)' }}>
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
                        color:
                          card.status === 'Live'
                            ? '#4EC98C'
                            : card.status === 'Syncing'
                              ? '#6C7AFF'
                              : 'var(--linear-text-tertiary)',
                        backgroundColor:
                          card.status === 'Live'
                            ? 'rgba(78, 201, 140, 0.12)'
                            : card.status === 'Syncing'
                              ? 'rgba(108, 122, 255, 0.12)'
                              : 'rgba(255,255,255,0.05)',
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
