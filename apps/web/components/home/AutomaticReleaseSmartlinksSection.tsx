import { ChevronRight, Disc3, ExternalLink, Link2 } from 'lucide-react';

import { SocialIcon } from '@/components/atoms/SocialIcon';
import { Container } from '@/components/site/Container';
import { DSP_CONFIGS } from '@/lib/dsp';
import { RELEASES } from './demo/mock-data';

/* ------------------------------------------------------------------ */
/*  DSP platforms shown on the floating smart link card                  */
/* ------------------------------------------------------------------ */
const SMART_LINK_DSPS = [
  'spotify',
  'apple_music',
  'youtube_music',
  'amazon_music',
] as const;

/* ------------------------------------------------------------------ */
/*  Provider dots shown per release row                                 */
/* ------------------------------------------------------------------ */
const PROVIDER_KEYS = [
  'spotify',
  'apple_music',
  'youtube_music',
  'deezer',
] as const;

export function AutomaticReleaseSmartlinksSection() {
  return (
    <section className='section-spacing-linear relative overflow-hidden bg-[var(--linear-bg-page)]'>
      {/* Ambient glow behind the mockup */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/3'
        style={{
          width: '800px',
          height: '600px',
          borderRadius: '50%',
          background:
            'radial-gradient(ellipse at center, oklch(20% 0.02 260 / 0.25), transparent 70%)',
        }}
      />

      <Container size='homepage'>
        <div className='relative mx-auto max-w-[var(--linear-content-max)]'>
          {/* Two-column header */}
          <div className='grid md:grid-cols-2 md:items-start section-gap-linear'>
            <h2 className='max-w-md marketing-h2-linear text-[var(--linear-text-primary)]'>
              New release?
              <br />
              Already live.
            </h2>
            <div className='max-w-lg'>
              <p className='marketing-lead-linear text-[var(--linear-text-secondary)]'>
                Connect Spotify once. Every new release automatically gets a
                smart link — Spotify, Apple Music, YouTube Music, all in one
                page your fans actually use.
              </p>
              <span className='mt-6 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 border transition-colors text-[var(--linear-caption-size)] font-[var(--linear-font-weight-medium)] text-[var(--linear-text-primary)] bg-[var(--linear-bg-surface-1)] border-[var(--linear-border-default)]'>
                Zero manual work
              </span>
            </div>
          </div>

          {/* Full Width Product Mockup */}
          <div className='relative mt-16 md:mt-20 mx-auto w-full'>
            <div className='relative w-full'>
              {/* Dashboard Window — releases table */}
              <div
                className='relative overflow-hidden rounded-xl md:rounded-2xl md:w-[85%] md:mt-8'
                style={{
                  border: '1px solid var(--linear-border-subtle)',
                  backgroundColor: 'var(--linear-bg-surface-0)',
                  boxShadow:
                    'var(--linear-shadow-card-elevated), 0 0 80px rgba(0,0,0,0.3)',
                }}
              >
                {/* Shine border overlay */}
                <div
                  aria-hidden='true'
                  className='pointer-events-none absolute inset-0 rounded-xl md:rounded-2xl z-10'
                  style={{
                    border: '1px solid rgba(255,255,255,0.04)',
                  }}
                />

                {/* Mac window chrome */}
                <div className='flex items-center px-5 h-12 border-b border-[var(--linear-border-subtle)] bg-[var(--linear-bg-surface-1)]'>
                  <div className='flex gap-2'>
                    <div className='w-3 h-3 rounded-full bg-[#ED6A5E] border border-black/10' />
                    <div className='w-3 h-3 rounded-full bg-[#F4BF4F] border border-black/10' />
                    <div className='w-3 h-3 rounded-full bg-[#61C554] border border-black/10' />
                  </div>
                  <div className='flex-1 text-center text-[var(--linear-caption-size)] text-[var(--linear-text-tertiary)]'>
                    Jovie Dashboard
                  </div>
                  <div className='w-[52px]' />
                </div>

                {/* Releases table */}
                <ReleasesTable />

                {/* Bottom gradient fade */}
                <div className='pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-linear-to-t from-[var(--linear-bg-surface-0)] to-transparent' />
              </div>

              {/* Floating Smart Link Card */}
              <div
                className='absolute z-10 hidden md:flex flex-col right-0 top-0 w-[272px] overflow-hidden rounded-2xl'
                style={{
                  backgroundColor: 'var(--linear-bg-surface-0)',
                  color: 'var(--linear-text-primary)',
                  boxShadow:
                    '0 0 0 1px var(--linear-border-subtle), var(--linear-shadow-card-elevated), 0 20px 60px rgba(0,0,0,0.4)',
                }}
              >
                {/* Shine border overlay */}
                <div
                  aria-hidden='true'
                  className='pointer-events-none absolute inset-0 rounded-2xl z-10'
                  style={{ border: '1px solid rgba(255,255,255,0.05)' }}
                />

                {/* Ambient glow */}
                <div className='pointer-events-none absolute inset-0'>
                  <div
                    className='absolute left-1/2 top-1/3 size-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[120px]'
                    style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
                  />
                </div>

                <div className='relative px-6 pt-10 pb-5 flex flex-col items-center'>
                  {/* Album artwork */}
                  <div
                    className='relative w-full aspect-square overflow-hidden rounded-lg shadow-2xl shadow-black/40'
                    style={{
                      border: '1px solid var(--linear-border-subtle)',
                      background: 'linear-gradient(135deg, #2a1f3d, #4a2d6b)',
                    }}
                  >
                    <div className='flex h-full w-full items-center justify-center'>
                      <Disc3
                        className='h-16 w-16 text-[var(--linear-text-tertiary)]'
                        aria-hidden='true'
                      />
                    </div>
                  </div>

                  {/* Release info */}
                  <div className='mt-4 w-full text-center'>
                    <h3 className='text-lg font-[var(--linear-font-weight-semibold)] leading-snug tracking-tight'>
                      The Deep End
                    </h3>
                    <p className='mt-1 text-sm text-[var(--linear-text-secondary)]'>
                      Tim White
                    </p>
                    <p className='mt-0.5 text-2xs tracking-wide text-[var(--linear-text-tertiary)]'>
                      Feb 2017
                    </p>
                  </div>

                  {/* Platform buttons — using real SocialIcon components */}
                  <div className='mt-5 w-full space-y-2'>
                    {SMART_LINK_DSPS.map(key => {
                      const config = DSP_CONFIGS[key];
                      if (!config) return null;
                      return (
                        <div
                          key={key}
                          className='group flex w-full items-center gap-3.5 rounded-xl px-4 py-3 backdrop-blur-sm transition-all duration-150 ease-out cursor-pointer bg-[var(--linear-bg-surface-1)] hover:bg-[var(--linear-bg-hover)]'
                          style={{
                            border: '1px solid var(--linear-border-subtle)',
                          }}
                        >
                          <SocialIcon
                            platform={key}
                            className='h-5 w-5 shrink-0 text-[var(--linear-text-tertiary)] transition-colors duration-150'
                            aria-hidden
                          />
                          <span className='flex-1 text-base font-[var(--linear-font-weight-semibold)] text-[var(--linear-text-primary)]'>
                            {config.name}
                          </span>
                          <ChevronRight
                            className='h-4 w-4 transition-all duration-150 text-[var(--linear-text-tertiary)] group-hover:text-[var(--linear-text-secondary)] group-hover:translate-x-0.5'
                            aria-hidden='true'
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* Powered by Jovie */}
                  <div className='mt-3 pt-3 text-center'>
                    <span className='inline-flex items-center gap-1 text-2xs uppercase tracking-widest text-[var(--linear-text-tertiary)]'>
                      <span>Powered by</span>
                      <span className='font-[var(--linear-font-weight-semibold)]'>
                        Jovie
                      </span>
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

/* ------------------------------------------------------------------ */
/*  Releases Table — uses real DSP provider dots                        */
/* ------------------------------------------------------------------ */

function ReleasesTable() {
  return (
    <div className='bg-[var(--linear-bg-surface-0)]'>
      {/* Table header */}
      <div className='flex items-center justify-between border-b border-[var(--linear-border-subtle)] px-5 py-3'>
        <div className='flex items-center gap-2'>
          <span className='text-[var(--linear-caption-size)] font-[var(--linear-font-weight-medium)] text-[var(--linear-text-primary)]'>
            Releases
          </span>
          <span className='rounded-full px-2 py-0.5 text-[var(--linear-label-size)] font-[var(--linear-font-weight-medium)] text-[var(--linear-text-secondary)] bg-[var(--linear-bg-surface-2)]'>
            {RELEASES.length}
          </span>
        </div>
        <div className='flex items-center gap-2'>
          <span className='text-[var(--linear-label-size)] text-[var(--linear-text-tertiary)]'>
            All synced from Spotify
          </span>
        </div>
      </div>

      {/* Column headers */}
      <div className='grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-4 border-b border-[var(--linear-border-subtle)] px-5 py-2'>
        <span className='w-10' />
        <span className='text-[var(--linear-label-size)] font-[var(--linear-font-weight-medium)] uppercase tracking-[0.05em] text-[var(--linear-text-tertiary)]'>
          Title
        </span>
        <span className='text-[var(--linear-label-size)] font-[var(--linear-font-weight-medium)] uppercase tracking-[0.05em] text-[var(--linear-text-tertiary)] hidden sm:block'>
          Platforms
        </span>
        <span className='text-[var(--linear-label-size)] font-[var(--linear-font-weight-medium)] uppercase tracking-[0.05em] text-[var(--linear-text-tertiary)] hidden md:block'>
          Type
        </span>
        <span className='text-[var(--linear-label-size)] font-[var(--linear-font-weight-medium)] uppercase tracking-[0.05em] text-[var(--linear-text-tertiary)]'>
          Smart Link
        </span>
      </div>

      {/* Rows */}
      {RELEASES.map((release, i) => (
        <div
          key={release.id}
          className='grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-4 px-5 py-3 transition-colors duration-150 hover:bg-[var(--linear-bg-hover)]'
          style={{
            borderBottom:
              i < RELEASES.length - 1
                ? '1px solid var(--linear-border-subtle)'
                : undefined,
          }}
        >
          {/* Artwork swatch */}
          <div
            className='h-10 w-10 shrink-0 rounded-md'
            style={{ background: release.gradient }}
          />

          {/* Title + date */}
          <div className='min-w-0'>
            <p className='truncate text-[var(--linear-caption-size)] font-[var(--linear-font-weight-medium)] text-[var(--linear-text-primary)]'>
              {release.title}
            </p>
            <p className='mt-0.5 text-[var(--linear-label-size)] text-[var(--linear-text-tertiary)]'>
              {release.date} · {release.trackCount}{' '}
              {release.trackCount === 1 ? 'track' : 'tracks'}
            </p>
          </div>

          {/* Provider dots — matches real ReleaseTable availability column */}
          <div className='hidden sm:flex items-center gap-1'>
            {PROVIDER_KEYS.map(key => {
              const config = DSP_CONFIGS[key];
              const isAvailable = release.platforms.some(
                p =>
                  p.toLowerCase().replace(/\s+/g, '_') === key ||
                  p.toLowerCase().replace(/\s+/g, '') === key.replace(/_/g, '')
              );
              return (
                <span
                  key={key}
                  className='inline-flex h-5 w-5 items-center justify-center rounded-full transition-opacity duration-150'
                  style={{
                    backgroundColor: isAvailable
                      ? `${config?.color ?? '#888'}20`
                      : 'var(--linear-bg-surface-2)',
                    color: isAvailable
                      ? config?.color
                      : 'var(--linear-text-tertiary)',
                    opacity: isAvailable ? 1 : 0.3,
                  }}
                  title={config?.name}
                >
                  <SocialIcon platform={key} className='h-3 w-3' aria-hidden />
                </span>
              );
            })}
          </div>

          {/* Type badge */}
          <span className='hidden md:inline-flex rounded-full px-2 py-0.5 text-[var(--linear-label-size)] font-[var(--linear-font-weight-medium)] text-[var(--linear-text-secondary)] bg-[var(--linear-bg-surface-2)]'>
            {release.type}
          </span>

          {/* Smart link status */}
          {release.hasSmartLink ? (
            <span
              className='inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-[var(--linear-font-weight-medium)]'
              style={{
                color: 'var(--linear-success)',
                backgroundColor:
                  'oklch(from var(--linear-success) l c h / 0.12)',
              }}
            >
              <Link2 className='h-3 w-3' aria-hidden='true' />
              Live
            </span>
          ) : (
            <span className='inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-[var(--linear-font-weight-medium)] text-[var(--linear-text-tertiary)] bg-[var(--linear-bg-surface-2)]'>
              <ExternalLink className='h-3 w-3' aria-hidden='true' />
              None
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
