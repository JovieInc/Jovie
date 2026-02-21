import { Container } from '@/components/site/Container';
import {
  RELEASE_AUTOMATION_ACTIVITY,
  RELEASE_AUTOMATION_PLATFORM_HEALTH,
  RELEASE_AUTOMATION_RELEASE,
} from './demo/mock-data';

export function AutomaticReleaseSmartlinksSection() {
  return (
    <section
      className='section-spacing-linear'
      style={{ backgroundColor: 'var(--linear-bg-page)' }}
    >
      <Container size='homepage'>
        <div className='mx-auto max-w-6xl'>
          <div className='grid gap-6 md:grid-cols-2 md:items-start'>
            <h2
              className='max-w-md text-3xl font-semibold tracking-tight sm:text-4xl'
              style={{ color: 'var(--linear-text-primary)' }}
            >
              Automatic smartlinks for every release.
            </h2>
            <p
              className='max-w-lg text-base sm:text-lg'
              style={{ color: 'var(--linear-text-secondary)' }}
            >
              Publish once, and Jovie creates a polished release smartlink
              instantly — populated with platform destinations, artwork, and
              metadata your fans can trust.
            </p>
          </div>

          <div className='relative mt-12'>
            <div
              className='relative overflow-hidden rounded-[28px] p-5 sm:p-8'
              style={{
                border: '1px solid var(--linear-border-subtle)',
                background:
                  'radial-gradient(120% 160% at 50% 0%, rgba(91,112,255,0.12), rgba(7,11,19,0.92) 62%)',
              }}
            >
              <DesktopReleaseBackground />

              <div className='pointer-events-none absolute inset-0 bg-gradient-to-t from-[rgba(4,7,13,0.92)] to-transparent' />

              <div className='relative z-10 flex justify-center sm:justify-start sm:pl-8 lg:pl-16'>
                <MobileSmartlinkForeground />
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

function DesktopReleaseBackground() {
  return (
    <div
      aria-hidden='true'
      className='pointer-events-none mx-auto hidden w-full max-w-5xl overflow-hidden rounded-2xl border p-4 opacity-45 blur-[1.5px] sm:block'
      style={{
        borderColor: 'var(--linear-border-subtle)',
        backgroundColor: 'rgba(10, 14, 24, 0.9)',
      }}
    >
      <div
        className='flex items-center justify-between rounded-xl px-4 py-3'
        style={{
          border: '1px solid var(--linear-border-subtle)',
          backgroundColor: 'rgba(19, 24, 36, 0.88)',
        }}
      >
        <div>
          <p className='text-sm font-medium text-white'>Releases</p>
          <p className='text-xs text-[var(--linear-text-tertiary)]'>
            {RELEASE_AUTOMATION_PLATFORM_HEALTH.length} destinations verified
          </p>
        </div>
        <span
          className='rounded-full px-3 py-1 text-[11px] font-medium text-white'
          style={{ backgroundColor: 'rgba(112, 126, 255, 0.8)' }}
        >
          Auto-linking active
        </span>
      </div>

      <div className='mt-4 grid gap-4 lg:grid-cols-[1.35fr_0.85fr]'>
        <div
          className='overflow-hidden rounded-xl border'
          style={{ borderColor: 'var(--linear-border-subtle)' }}
        >
          <div
            className='grid grid-cols-[1.4fr_0.9fr_0.9fr_0.8fr] px-4 py-2 text-[11px] uppercase tracking-[0.08em]'
            style={{
              color: 'var(--linear-text-tertiary)',
              backgroundColor: 'rgba(13, 18, 28, 0.88)',
            }}
          >
            <span>Release</span>
            <span>Status</span>
            <span>Smartlink</span>
            <span className='text-right'>Updated</span>
          </div>

          <div
            className='grid grid-cols-[1.4fr_0.9fr_0.9fr_0.8fr] items-center px-4 py-3 text-sm'
            style={{
              color: 'var(--linear-text-primary)',
              borderTop: '1px solid var(--linear-border-subtle)',
            }}
          >
            <span className='truncate'>{RELEASE_AUTOMATION_RELEASE.title}</span>
            <span className='text-[var(--linear-text-secondary)]'>Shipped</span>
            <span className='text-[var(--linear-accent)]'>Generated</span>
            <span className='text-right text-[var(--linear-text-tertiary)]'>
              32s ago
            </span>
          </div>
        </div>

        <div
          className='overflow-hidden rounded-xl border'
          style={{ borderColor: 'var(--linear-border-subtle)' }}
        >
          <div
            className='px-4 py-2 text-[11px] uppercase tracking-[0.08em]'
            style={{
              color: 'var(--linear-text-tertiary)',
              backgroundColor: 'rgba(13, 18, 28, 0.88)',
            }}
          >
            Release drawer
          </div>

          <div className='space-y-2 px-4 py-3'>
            {RELEASE_AUTOMATION_ACTIVITY.map(activity => (
              <div
                key={activity.id}
                className='rounded-lg border px-3 py-2'
                style={{
                  borderColor: 'rgba(108, 122, 255, 0.28)',
                  backgroundColor: 'rgba(95, 109, 255, 0.08)',
                }}
              >
                <p className='text-xs font-medium text-white'>
                  {activity.title}
                </p>
                <p className='mt-1 text-[11px] text-[var(--linear-text-tertiary)]'>
                  {activity.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MobileSmartlinkForeground() {
  return (
    <div
      className='relative w-full max-w-[320px] overflow-hidden rounded-[26px] border p-4 shadow-2xl'
      style={{
        borderColor: 'rgba(151, 162, 255, 0.45)',
        background:
          'linear-gradient(180deg, rgba(15,19,31,0.98) 0%, rgba(9,12,20,0.98) 100%)',
        boxShadow: '0 30px 70px rgba(6, 8, 15, 0.55)',
      }}
    >
      <div
        className='h-24 rounded-xl'
        style={{ background: RELEASE_AUTOMATION_RELEASE.gradient }}
      />

      <div className='mt-4'>
        <p className='text-base font-semibold text-white'>
          {RELEASE_AUTOMATION_RELEASE.title}
        </p>
        <p className='text-xs text-[var(--linear-text-tertiary)]'>
          {RELEASE_AUTOMATION_RELEASE.artist} ·{' '}
          {RELEASE_AUTOMATION_RELEASE.date}
        </p>
      </div>

      <div className='mt-4 space-y-2'>
        {RELEASE_AUTOMATION_PLATFORM_HEALTH.map(platform => (
          <div
            key={platform.name}
            className='flex items-center justify-between rounded-lg border px-3 py-2.5'
            style={{
              borderColor: 'var(--linear-border-subtle)',
              backgroundColor: 'rgba(20, 26, 38, 0.85)',
            }}
          >
            <span className='text-sm text-[var(--linear-text-primary)]'>
              {platform.name}
            </span>
            <span
              className='rounded-full px-2 py-0.5 text-[10px] font-medium text-white'
              style={{
                backgroundColor:
                  platform.status === 'Live'
                    ? 'rgba(78, 201, 140, 0.75)'
                    : 'rgba(112, 126, 255, 0.72)',
              }}
            >
              {platform.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
