import { Divider, MockBar, WRAP } from './shared';

export function AudienceSection() {
  return (
    <>
      {/* ═══ 15. AUDIENCE INTELLIGENCE ═══ */}
      <div className={WRAP}>
        <Divider />
        <section
          aria-labelledby='audience-heading'
          className='section-spacing-linear grid grid-cols-1 md:grid-cols-2 gap-x-16 items-start'
        >
          <div>
            <h2
              id='audience-heading'
              className='marketing-h2-linear max-w-[440px]'
            >
              Know every fan{' '}
              <span className='text-secondary-token'>by name</span>
            </h2>
          </div>
          <div className='pt-1'>
            <p className='marketing-lead-linear max-w-[480px]'>
              Most artists have zero data on their visitors. Jovie captures
              every interaction and scores each fan by engagement &mdash; so you
              know who your real fans are.
            </p>
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-x-8 mt-10 pt-6 border-t border-subtle'>
              {[
                { num: '5.1', title: 'Fan Engagement Scoring' },
                { num: '5.2', title: 'Source Attribution' },
                { num: '5.3', title: 'Subscriber Funnel' },
                { num: '5.4', title: 'Export & Sync' },
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

      {/* ═══ 16. AUDIENCE DASHBOARD MOCKUP ═══ */}
      <div className={`${WRAP} pb-16`}>
        <div
          className='rounded-[10px] overflow-hidden'
          style={{
            background: 'var(--linear-bg-surface-0)',
            border: '1px solid var(--linear-border-subtle)',
          }}
        >
          <MockBar url='app.jov.ie — Audience' />
          <div
            className='grid grid-cols-1 md:grid-cols-[200px_1fr]'
            style={{ minHeight: 380 }}
          >
            {/* Sidebar */}
            <div
              className='hidden md:block'
              style={{
                background: 'var(--linear-bg-surface-1)',
                borderRight: '1px solid var(--linear-border-subtle)',
                padding: '1rem 0',
                fontSize: '0.8rem',
              }}
            >
              {/* Profile */}
              <div
                className='flex items-center gap-2 px-4 pb-4 mb-2'
                style={{
                  borderBottom: '1px solid var(--linear-border-subtle)',
                }}
              >
                <div
                  className='w-7 h-7 rounded-full shrink-0'
                  style={{
                    background: 'linear-gradient(135deg, #2a1f3d, #1a1a2e)',
                  }}
                />
                <span className='font-medium' style={{ fontSize: '0.8rem' }}>
                  Tim White
                </span>
              </div>
              {/* Nav items */}
              {[
                { icon: '☰', label: 'Releases', active: false },
                { icon: '☷', label: 'Audience', active: true },
                { icon: '✉', label: 'Threads', active: false },
              ].map(item => (
                <div
                  key={item.label}
                  className='flex items-center gap-2 px-4 py-1.5'
                  style={{
                    color: item.active
                      ? 'var(--linear-text-primary)'
                      : 'var(--linear-text-tertiary)',
                    background: item.active
                      ? 'rgba(255,255,255,0.03)'
                      : undefined,
                  }}
                >
                  <span style={{ opacity: 0.5 }}>{item.icon}</span>
                  {item.label}
                </div>
              ))}
              <div
                className='uppercase tracking-wide px-4 pt-3 pb-1'
                style={{
                  fontSize: '0.65rem',
                  color: 'var(--linear-text-tertiary)',
                  letterSpacing: '0.08em',
                  opacity: 0.6,
                }}
              >
                Admin
              </div>
              {[
                { icon: '■', label: 'Dashboard' },
                { icon: '☆', label: 'Activity' },
              ].map(item => (
                <div
                  key={item.label}
                  className='flex items-center gap-2 px-4 py-1.5'
                  style={{ color: 'var(--linear-text-tertiary)' }}
                >
                  <span style={{ opacity: 0.5 }}>{item.icon}</span>
                  {item.label}
                </div>
              ))}
            </div>

            {/* Main */}
            <div className='p-6'>
              <div className='flex items-center justify-between mb-6'>
                <div className='font-semibold' style={{ fontSize: '1rem' }}>
                  Audience
                </div>
                <div className='flex gap-2'>
                  {['Filter', 'Display', 'Export'].map(btn => (
                    <span
                      key={btn}
                      className='px-2.5 py-1 rounded'
                      style={{
                        fontSize: '0.7rem',
                        border: '1px solid var(--linear-border-subtle)',
                        color: 'var(--linear-text-tertiary)',
                      }}
                    >
                      {btn}
                    </span>
                  ))}
                </div>
              </div>

              {/* Metrics */}
              <div
                className='grid grid-cols-3 gap-px rounded-md overflow-hidden mb-6'
                style={{ background: 'var(--linear-border-subtle)' }}
              >
                {[
                  { label: 'Views', val: '2,847', sub: '' },
                  {
                    label: 'Visitors',
                    val: '1,392',
                    sub: '48.9% of views',
                  },
                  {
                    label: 'Subscribers',
                    val: '214',
                    sub: '15.4% conversion',
                  },
                ].map(m => (
                  <div
                    key={m.label}
                    className='p-4'
                    style={{ background: 'var(--linear-bg-surface-0)' }}
                  >
                    <div
                      className='uppercase tracking-wide mb-1'
                      style={{
                        fontSize: '0.7rem',
                        color: 'var(--linear-text-tertiary)',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {m.label}
                    </div>
                    <div
                      className='font-semibold'
                      style={{
                        fontSize: '1.5rem',
                        letterSpacing: '-0.02em',
                      }}
                    >
                      {m.val}
                    </div>
                    {m.sub && (
                      <div
                        style={{
                          fontSize: '0.7rem',
                          color: 'var(--linear-text-tertiary)',
                          marginTop: '0.15rem',
                        }}
                      >
                        {m.sub}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Table */}
              <table className='w-full border-collapse'>
                <thead>
                  <tr>
                    {[
                      'Visitor',
                      'Engagement',
                      'Status',
                      'Source',
                      'Last Action',
                    ].map(th => (
                      <th
                        key={th}
                        scope='col'
                        className='text-left font-medium uppercase tracking-wide px-3 py-2 text-[0.7rem] text-tertiary-token border-b border-subtle'
                      >
                        {th}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      visitor: 'alex.rivera@gmail.com',
                      intent: 'High',
                      status: 'Returning',
                      source: 'Instagram',
                      action: 'Played Signals',
                    },
                    {
                      visitor: 'jordan_beats',
                      intent: 'High',
                      status: 'New',
                      source: 'Twitter',
                      action: 'Subscribed',
                    },
                    {
                      visitor: 'maya.k@outlook.com',
                      intent: 'Low',
                      status: 'New',
                      source: 'Direct',
                      action: 'Viewed profile',
                    },
                    {
                      visitor: 'chris_soundwave',
                      intent: 'High',
                      status: 'Returning',
                      source: 'Spotify',
                      action: 'Tipped $5',
                    },
                  ].map(row => (
                    <tr key={row.visitor}>
                      <td
                        className='px-3 py-2.5'
                        style={{
                          fontSize: '0.8rem',
                          borderBottom: '1px solid rgba(255,255,255,0.03)',
                        }}
                      >
                        {row.visitor}
                      </td>
                      <td
                        className='px-3 py-2.5'
                        style={{
                          fontSize: '0.8rem',
                          borderBottom: '1px solid rgba(255,255,255,0.03)',
                        }}
                      >
                        <span
                          className='inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm'
                          style={{
                            fontSize: '0.7rem',
                            background:
                              row.intent === 'High'
                                ? 'rgba(74,222,128,0.08)'
                                : 'rgba(255,255,255,0.04)',
                            color:
                              row.intent === 'High'
                                ? 'rgb(52 211 153)'
                                : 'var(--linear-text-tertiary)',
                          }}
                        >
                          &#9679; {row.intent}
                        </span>
                      </td>
                      <td
                        className='px-3 py-2.5'
                        style={{
                          fontSize: '0.8rem',
                          borderBottom: '1px solid rgba(255,255,255,0.03)',
                        }}
                      >
                        <span
                          className='px-1.5 py-0.5 rounded-sm'
                          style={{
                            fontSize: '0.65rem',
                            background:
                              row.status === 'New'
                                ? 'rgba(59,130,246,0.08)'
                                : 'rgba(255,255,255,0.04)',
                            color:
                              row.status === 'New'
                                ? 'rgb(59 130 246)'
                                : 'var(--linear-text-tertiary)',
                          }}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td
                        className='px-3 py-2.5'
                        style={{
                          fontSize: '0.8rem',
                          color: 'var(--linear-text-secondary)',
                          borderBottom: '1px solid rgba(255,255,255,0.03)',
                        }}
                      >
                        {row.source}
                      </td>
                      <td
                        className='px-3 py-2.5'
                        style={{
                          fontSize: '0.8rem',
                          color: 'var(--linear-text-secondary)',
                          borderBottom: '1px solid rgba(255,255,255,0.03)',
                        }}
                      >
                        {row.action}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
