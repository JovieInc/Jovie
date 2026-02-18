import { Divider, MockBar, WRAP } from './shared';

export function SmartLinksSection() {
  return (
    <>
      {/* ═══ 7. SMART LINKS ═══ */}
      <div className={WRAP}>
        <Divider />
        <section
          aria-labelledby='smartlinks-heading'
          className='section-spacing-linear grid grid-cols-1 md:grid-cols-2 gap-x-16 items-start'
        >
          <div>
            <h2
              id='smartlinks-heading'
              className='marketing-h2-linear max-w-[440px]'
            >
              Every release, every platform,{' '}
              <span className='text-secondary-token'>one link</span>
            </h2>
          </div>
          <div className='pt-1'>
            <p className='marketing-lead-linear max-w-[480px]'>
              Connect Spotify and Jovie creates a smart link for every release
              &mdash; automatically matched across platforms. No manual setup.
              No maintenance.
            </p>
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-x-8 mt-10 pt-6 border-t border-subtle'>
              {[
                { num: '2.1', title: 'Auto-Created Links' },
                { num: '2.2', title: 'Platform Auto-Matching' },
                { num: '2.3', title: 'Pre-save Pages' },
                { num: '2.4', title: 'Click Analytics' },
              ].map(sf => (
                <div key={sf.num} className='py-2'>
                  <div className='font-mono text-xs text-tertiary-token mb-1'>
                    {sf.num}
                  </div>
                  <div className='text-sm font-medium'>{sf.title}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* ═══ 8. RELEASES MOCKUP ═══ */}
      <div className={`${WRAP} pb-16`}>
        <div
          className='rounded-[10px] overflow-hidden'
          style={{
            background: 'var(--linear-bg-surface-0)',
            border: '1px solid var(--linear-border-subtle)',
          }}
        >
          <MockBar url='app.jov.ie — Releases' />
          {/* Banner */}
          <div
            className='flex items-center gap-3 px-5 py-3.5'
            style={{
              background:
                'linear-gradient(135deg, rgba(74,222,128,0.04), rgba(59,130,246,0.04))',
              borderBottom: '1px solid var(--linear-border-subtle)',
              fontSize: '0.8rem',
              color: 'var(--linear-text-secondary)',
            }}
          >
            <span style={{ fontSize: '1.1rem' }}>&#10024;</span>
            <div className='flex-1'>
              <div>
                <strong
                  className='font-medium'
                  style={{ color: 'var(--linear-text-primary)' }}
                >
                  We auto-created all 21 smart links for you.
                </strong>
              </div>
              <div
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--linear-text-tertiary)',
                  marginTop: '0.15rem',
                }}
              >
                5 are active on your free plan. Upgrade to Pro to unlock all 21
                and save ~7h of setup.
              </div>
            </div>
            <div className='flex items-center gap-1.5 font-medium ml-auto text-xs text-emerald-400'>
              <span className='w-1.5 h-1.5 rounded-full bg-emerald-400' />{' '}
              Connected
            </div>
          </div>

          {/* Content: list + detail */}
          <div className='grid grid-cols-1 md:grid-cols-[1fr_280px]'>
            {/* Releases list */}
            <div
              className='p-4 px-5'
              style={{
                borderRight: '1px solid var(--linear-border-subtle)',
              }}
            >
              {[
                {
                  title: 'The Sound',
                  type: 'Single',
                  date: 'Mar 2018',
                  badge: 'Smart Link',
                  active: true,
                  gradient: 'linear-gradient(135deg,#2d1f1a,#2a1a1a)',
                },
                {
                  title: 'Fading Light',
                  type: 'EP',
                  date: 'Nov 2019',
                  badge: 'Smart Link',
                  active: false,
                  gradient: 'linear-gradient(135deg,#1a1f2d,#1a1a2e)',
                },
                {
                  title: 'Where It Goes',
                  type: 'Single',
                  date: 'Jun 2020',
                  badge: 'Pro',
                  active: false,
                  gradient: 'linear-gradient(135deg,#1f2d1a,#1a2a1a)',
                },
                {
                  title: 'Signals',
                  type: 'Album',
                  date: 'Feb 2022',
                  badge: 'Pro',
                  active: false,
                  gradient: 'linear-gradient(135deg,#2a1f3d,#1a1a2e)',
                },
              ].map(r => (
                <div
                  key={r.title}
                  className='flex items-center gap-3 p-2 rounded-md'
                  style={{
                    background: r.active ? 'rgba(255,255,255,0.03)' : undefined,
                  }}
                >
                  <div
                    className='w-10 h-10 rounded shrink-0'
                    style={{ background: r.gradient }}
                  />
                  <div className='flex-1'>
                    <div
                      className='font-medium'
                      style={{ fontSize: '0.85rem' }}
                    >
                      {r.title}
                    </div>
                    <div
                      className='flex items-center gap-2 mt-0.5'
                      style={{
                        fontSize: '0.72rem',
                        color: 'var(--linear-text-tertiary)',
                      }}
                    >
                      <span
                        className='uppercase tracking-wide'
                        style={{
                          fontSize: '0.6rem',
                          padding: '0.1rem 0.3rem',
                          borderRadius: 2,
                          background: 'rgba(255,255,255,0.05)',
                        }}
                      >
                        {r.type}
                      </span>
                      {r.date}
                      <span
                        style={{
                          fontSize: '0.6rem',
                          padding: '0.1rem 0.35rem',
                          borderRadius: 2,
                          background: 'rgba(74,222,128,0.06)',
                          color: 'rgb(52 211 153)',
                          opacity: r.badge === 'Pro' ? 0.4 : 0.7,
                        }}
                      >
                        {r.badge}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Detail panel */}
            <div className='p-5'>
              <div
                className='flex gap-0 mb-4'
                style={{
                  borderBottom: '1px solid var(--linear-border-subtle)',
                }}
              >
                {['Catalog', 'Links', 'Details'].map((tab, i) => (
                  <div
                    key={tab}
                    className='px-3 py-2'
                    style={{
                      fontSize: '0.75rem',
                      color:
                        i === 0
                          ? 'var(--linear-text-primary)'
                          : 'var(--linear-text-tertiary)',
                      borderBottom:
                        i === 0
                          ? '2px solid var(--linear-text-primary)'
                          : '2px solid transparent',
                    }}
                  >
                    {tab}
                  </div>
                ))}
              </div>
              <div className='font-semibold mb-1' style={{ fontSize: '1rem' }}>
                The Sound
              </div>
              <div
                className='mb-4'
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--linear-text-tertiary)',
                }}
              >
                Single &middot; March 22, 2018
              </div>
              {[
                {
                  label: 'Smart Link',
                  value: 'jov.ie/tim/the-sound',
                  isLink: true,
                },
                { label: 'Tracklist', value: '1. The Sound' },
                {
                  label: 'Matched Platforms',
                  value:
                    'Spotify, Apple Music, YouTube Music, Tidal, Amazon Music, Deezer',
                },
              ].map(field => (
                <div key={field.label} className='mb-3'>
                  <div
                    className='uppercase tracking-wide mb-0.5'
                    style={{
                      fontSize: '0.65rem',
                      color: 'var(--linear-text-tertiary)',
                      letterSpacing: '0.06em',
                    }}
                  >
                    {field.label}
                  </div>
                  <div
                    style={{
                      fontSize: field.isLink ? '0.75rem' : '0.8rem',
                      color: field.isLink
                        ? 'rgb(52 211 153)'
                        : 'var(--linear-text-secondary)',
                      fontFamily: field.isLink
                        ? "'SF Mono', 'Fira Code', monospace"
                        : undefined,
                    }}
                  >
                    {field.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
