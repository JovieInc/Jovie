import { Divider, MockBar, WRAP } from './shared';

export function DeeplinksSection() {
  return (
    <>
      {/* ═══ 9. DEEPLINKS ═══ */}
      <div className={WRAP}>
        <Divider />
        <section
          aria-labelledby='deeplinks-heading'
          className='section-spacing-linear grid grid-cols-1 md:grid-cols-2 gap-x-16 items-start'
        >
          <div>
            <h2
              id='deeplinks-heading'
              className='marketing-h2-linear max-w-[440px]'
            >
              One profile.{' '}
              <span className='text-secondary-token'>Infinite deeplinks.</span>
            </h2>
          </div>
          <div className='pt-1'>
            <p className='marketing-lead-linear max-w-[480px]'>
              Sometimes you want a specific action &mdash; a tip jar at shows, a
              contact page for industry, tour dates in your bio. Deeplinks point
              directly to any view of your profile.
            </p>
            <p className='marketing-lead-linear mt-4 max-w-[480px] !text-[0.95rem]'>
              Instagram allows 5 links. With deeplinks, each one goes straight
              to a specific view &mdash; zero friction.
            </p>
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-x-8 mt-10 pt-6 border-t border-subtle'>
              {[
                { num: '3.1', title: '/tip' },
                { num: '3.2', title: '/tour' },
                { num: '3.3', title: '/contact' },
                { num: '3.4', title: '/listen' },
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

      {/* ═══ 10. IG COMPARE ═══ */}
      <div className={`${WRAP} pb-16`}>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
          {/* With Linktree */}
          <div
            className='rounded-[10px] overflow-hidden'
            style={{
              background: 'var(--linear-bg-surface-0)',
              border: '1px solid var(--linear-border-subtle)',
            }}
          >
            <MockBar url='Instagram · @timwhite · 1 link' />
            <div className='p-6'>
              <div
                className='uppercase tracking-wide font-medium mb-4'
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--linear-text-tertiary)',
                  letterSpacing: '0.06em',
                }}
              >
                With Linktree
              </div>
              <div
                className='flex items-center justify-between p-3 rounded-md'
                style={{
                  background: 'var(--linear-bg-surface-2)',
                  border: '1px solid var(--linear-border-subtle)',
                  fontSize: '0.78rem',
                }}
              >
                <span className='font-medium'>linktr.ee/timwhite</span>
                <span style={{ color: 'var(--linear-text-tertiary)' }}>
                  &rarr;
                </span>
              </div>
              <p
                className='mt-4'
                style={{
                  fontSize: '0.78rem',
                  color: 'var(--linear-text-tertiary)',
                  lineHeight: 1.45,
                }}
              >
                One link &rarr; Linktree page &rarr; tap again &rarr;
                destination. Two clicks. Linktree branding.
              </p>
            </div>
          </div>

          {/* With Jovie */}
          <div
            className='rounded-[10px] overflow-hidden'
            style={{
              background: 'var(--linear-bg-surface-0)',
              border: '1px solid var(--linear-border-subtle)',
            }}
          >
            <MockBar url='Instagram · @timwhite · 5 links' />
            <div className='p-6'>
              <div
                className='uppercase tracking-wide font-medium mb-4'
                style={{
                  fontSize: '0.75rem',
                  letterSpacing: '0.06em',
                }}
              >
                With Jovie Deeplinks
              </div>
              <div className='flex flex-col gap-2'>
                {[
                  { label: 'New Music', url: 'jov.ie/tim' },
                  { label: 'Tour Dates', url: 'jov.ie/tim/tour' },
                  { label: 'Tip Jar', url: 'jov.ie/tim/tip' },
                  { label: 'Booking', url: 'jov.ie/tim/contact' },
                  { label: 'Merch', url: 'jov.ie/tim/shop' },
                ].map(link => (
                  <div
                    key={link.url}
                    className='flex items-center justify-between p-3 rounded-md'
                    style={{
                      background: 'var(--linear-bg-surface-2)',
                      border: '1px solid var(--linear-border-subtle)',
                      fontSize: '0.78rem',
                    }}
                  >
                    <span className='font-medium'>{link.label}</span>
                    <span
                      className='font-mono'
                      style={{
                        fontSize: '0.7rem',
                        color: 'var(--linear-text-tertiary)',
                      }}
                    >
                      {link.url}
                    </span>
                  </div>
                ))}
              </div>
              <p
                className='mt-4'
                style={{
                  fontSize: '0.78rem',
                  color: 'var(--linear-text-tertiary)',
                  lineHeight: 1.45,
                }}
              >
                Five links &rarr; each goes directly to a specific view. Zero
                friction. Your branding.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ 11. DEEPLINK CARDS ═══ */}
      <div className={`${WRAP} pb-16`}>
        <div
          className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-px rounded-[10px] overflow-hidden'
          style={{ background: 'var(--linear-border-subtle)' }}
        >
          {/* /tip */}
          <div
            style={{
              background: 'var(--linear-bg-surface-0)',
              padding: '2rem 1.5rem',
            }}
          >
            <div
              className='font-mono mb-3 flex items-center gap-1'
              style={{ fontSize: '0.8rem' }}
            >
              <span style={{ color: 'var(--linear-text-tertiary)' }}>
                jov.ie/tim
              </span>{' '}
              /tip
            </div>
            <p
              className='mb-5'
              style={{
                fontSize: '0.85rem',
                color: 'var(--linear-text-secondary)',
                lineHeight: 1.5,
              }}
            >
              Accept tips from fans with one tap. Print the QR code and put it
              on your merch table at shows.
            </p>
            <div
              className='rounded-md p-4'
              style={{
                background: 'var(--linear-bg-surface-1)',
                border: '1px solid var(--linear-border-subtle)',
                fontSize: '0.75rem',
              }}
            >
              <div className='flex gap-2 mb-3'>
                {['$3', '$5', '$10'].map(amt => (
                  <div
                    key={amt}
                    className='flex-1 text-center py-2 font-semibold rounded'
                    style={{
                      background:
                        amt === '$5'
                          ? 'rgba(255,255,255,0.04)'
                          : 'var(--linear-bg-surface-2)',
                      border: `1px solid ${amt === '$5' ? 'var(--linear-text-tertiary)' : 'var(--linear-border-subtle)'}`,
                      fontSize: '0.85rem',
                    }}
                  >
                    {amt}
                  </div>
                ))}
              </div>
              <div
                className='w-full py-2 rounded text-center font-medium mb-1'
                style={{
                  background: '#008CFF',
                  color: 'white',
                  fontSize: '0.7rem',
                }}
              >
                Continue with Venmo
              </div>
              <div
                className='w-full py-2 rounded text-center font-medium'
                style={{
                  background: 'var(--linear-text-primary)',
                  color: 'var(--linear-bg-footer)',
                  fontSize: '0.7rem',
                }}
              >
                Continue with Apple Pay
              </div>
              <div
                className='text-center mt-2 pt-2'
                style={{
                  borderTop: '1px solid var(--linear-border-subtle)',
                  fontSize: '0.65rem',
                  color: 'var(--linear-text-tertiary)',
                }}
              >
                &#9634; QR code for merch table &middot; prints at any size
              </div>
            </div>
          </div>

          {/* /tour */}
          <div
            style={{
              background: 'var(--linear-bg-surface-0)',
              padding: '2rem 1.5rem',
            }}
          >
            <div
              className='font-mono mb-3 flex items-center gap-1'
              style={{ fontSize: '0.8rem' }}
            >
              <span style={{ color: 'var(--linear-text-tertiary)' }}>
                jov.ie/tim
              </span>{' '}
              /tour
            </div>
            <p
              className='mb-5'
              style={{
                fontSize: '0.85rem',
                color: 'var(--linear-text-secondary)',
                lineHeight: 1.5,
              }}
            >
              Tour dates that stay in sync. Fans find the show, buy the ticket.
            </p>
            <div
              className='rounded-md p-4'
              style={{
                background: 'var(--linear-bg-surface-1)',
                border: '1px solid var(--linear-border-subtle)',
                fontSize: '0.75rem',
              }}
            >
              {[
                {
                  city: 'Atlanta, GA',
                  venue: 'The Earl · Mar 14',
                },
                {
                  city: 'Nashville, TN',
                  venue: 'Exit/In · Mar 21',
                },
                {
                  city: 'Brooklyn, NY',
                  venue: "Baby's All Right · Apr 4",
                },
              ].map(td => (
                <div
                  key={td.city}
                  className='flex justify-between items-center py-1.5'
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    color: 'var(--linear-text-secondary)',
                  }}
                >
                  <div>
                    <div
                      className='font-medium'
                      style={{
                        color: 'var(--linear-text-primary)',
                        fontSize: '0.8rem',
                      }}
                    >
                      {td.city}
                    </div>
                    <div
                      style={{
                        fontSize: '0.7rem',
                        color: 'var(--linear-text-tertiary)',
                      }}
                    >
                      {td.venue}
                    </div>
                  </div>
                  <span
                    className='px-2 py-0.5 rounded-sm'
                    style={{
                      fontSize: '0.65rem',
                      border: '1px solid var(--linear-border-subtle)',
                      color: 'var(--linear-text-secondary)',
                    }}
                  >
                    Tickets
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* /contact */}
          <div
            style={{
              background: 'var(--linear-bg-surface-0)',
              padding: '2rem 1.5rem',
            }}
          >
            <div
              className='font-mono mb-3 flex items-center gap-1'
              style={{ fontSize: '0.8rem' }}
            >
              <span style={{ color: 'var(--linear-text-tertiary)' }}>
                jov.ie/tim
              </span>{' '}
              /contact
            </div>
            <p
              className='mb-5'
              style={{
                fontSize: '0.85rem',
                color: 'var(--linear-text-secondary)',
                lineHeight: 1.5,
              }}
            >
              One link for every industry contact. Manager, agent, publicist,
              brand deals, fan mail.
            </p>
            <div
              className='rounded-md p-4'
              style={{
                background: 'var(--linear-bg-surface-1)',
                border: '1px solid var(--linear-border-subtle)',
                fontSize: '0.75rem',
              }}
            >
              {[
                { role: 'Management', name: 'Sarah Kim' },
                { role: 'Booking', name: 'Marcus Dean' },
                { role: 'Publicist', name: 'Ava Chen' },
                { role: 'Brand Deals', name: 'brands@timwhite.co' },
                { role: 'Fan Mail', name: 'hello@timwhite.co' },
              ].map(c => (
                <div
                  key={c.role}
                  className='flex justify-between items-center py-1.5'
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--linear-text-tertiary)',
                    }}
                  >
                    {c.role}
                  </span>
                  <span className='font-medium' style={{ fontSize: '0.8rem' }}>
                    {c.name}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* /listen */}
          <div
            style={{
              background: 'var(--linear-bg-surface-0)',
              padding: '2rem 1.5rem',
            }}
          >
            <div
              className='font-mono mb-3 flex items-center gap-1'
              style={{ fontSize: '0.8rem' }}
            >
              <span style={{ color: 'var(--linear-text-tertiary)' }}>
                jov.ie/tim
              </span>{' '}
              /listen
            </div>
            <p
              className='mb-5'
              style={{
                fontSize: '0.85rem',
                color: 'var(--linear-text-secondary)',
                lineHeight: 1.5,
              }}
            >
              Skip the profile, go straight to the music. Detects each
              listener&apos;s preferred DSP and opens the right app.
            </p>
            <div
              className='rounded-md p-4'
              style={{
                background: 'var(--linear-bg-surface-1)',
                border: '1px solid var(--linear-border-subtle)',
                fontSize: '0.75rem',
              }}
            >
              {['Spotify', 'Apple Music', 'YouTube Music', 'Tidal'].map(dsp => (
                <div
                  key={dsp}
                  className='flex items-center gap-2 py-1.5'
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    fontSize: '0.8rem',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.65rem',
                      color: 'var(--linear-text-tertiary)',
                    }}
                  >
                    &#9654;
                  </span>
                  <span className='flex-1 font-medium'>{dsp}</span>
                  <span
                    className='px-1.5 py-0.5 rounded-sm'
                    style={{
                      fontSize: '0.65rem',
                      color: 'var(--linear-text-tertiary)',
                      border: '1px solid var(--linear-border-subtle)',
                    }}
                  >
                    Open
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
