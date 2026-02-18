import { AiDemo } from '@/components/home/AiDemo';
import { Divider, WRAP } from './shared';

export function AiSection() {
  return (
    <>
      {/* ═══ 12. AI SECTION ═══ */}
      <div className={WRAP}>
        <Divider />
        <section
          aria-labelledby='ai-heading'
          className='section-spacing-linear grid grid-cols-1 md:grid-cols-2 gap-x-16 items-start'
        >
          <div>
            <h2 id='ai-heading' className='marketing-h2-linear max-w-[440px]'>
              AI that knows{' '}
              <span className='text-secondary-token'>your music</span>
            </h2>
          </div>
          <div className='pt-1'>
            <p className='marketing-lead-linear max-w-[480px]'>
              Not a generic chatbot. Jovie&apos;s AI knows your full
              discography, streaming data, and career history. Write bios,
              generate press releases, create Spotify Canvases &mdash; grounded
              in your real catalog.
            </p>
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-x-8 mt-10 pt-6 border-t border-subtle'>
              {[
                { num: '4.1', title: 'Bio & Press Releases' },
                { num: '4.2', title: 'Spotify Canvas Generator' },
                { num: '4.3', title: 'Apple Lyrics Formatter' },
                { num: '4.4', title: 'Impersonation Alerts' },
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

      {/* ═══ 13. AI DEMO ═══ */}
      <div className={WRAP}>
        <AiDemo />

        {/* ═══ 14. AI FEATURES GRID ═══ */}
        <div
          className='grid grid-cols-1 md:grid-cols-3 gap-px rounded-lg overflow-hidden mt-8'
          style={{ background: 'var(--linear-border-subtle)' }}
        >
          {[
            {
              title: 'Spotify Canvas',
              desc: 'Turn your album art into an animated Canvas loop. Upload-ready for Spotify for Artists.',
              icon: (
                <svg
                  viewBox='0 0 24 24'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth={1.5}
                  className='w-[18px] h-[18px]'
                  aria-hidden='true'
                >
                  <circle cx='12' cy='12' r='10' />
                  <polygon
                    points='10,8 16,12 10,16'
                    fill='currentColor'
                    stroke='none'
                  />
                </svg>
              ),
            },
            {
              title: 'Chat Editing',
              desc: 'Edit your profile, smart links, and bio through natural language. Just tell it what to change.',
              icon: (
                <svg
                  viewBox='0 0 24 24'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth={1.5}
                  className='w-[18px] h-[18px]'
                  aria-hidden='true'
                >
                  <path d='M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z' />
                </svg>
              ),
            },
            {
              title: 'Impersonation Alerts',
              desc: 'Get notified when someone creates a fake profile using your name or artwork on Spotify.',
              icon: (
                <svg
                  viewBox='0 0 24 24'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth={1.5}
                  className='w-[18px] h-[18px]'
                  aria-hidden='true'
                >
                  <path d='M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z' />
                </svg>
              ),
            },
            {
              title: 'Apple Lyrics',
              desc: 'Paste your lyrics and get Apple-approved formatting — timed, synced, and ready to submit.',
              icon: (
                <svg
                  viewBox='0 0 24 24'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth={1.5}
                  className='w-[18px] h-[18px]'
                  aria-hidden='true'
                >
                  <path d='M9 18V5l12-2v13' />
                  <circle cx='6' cy='18' r='3' />
                  <circle cx='18' cy='16' r='3' />
                </svg>
              ),
            },
            {
              title: 'Press Releases',
              desc: 'Generate a press release grounded in your actual discography, data, and career milestones.',
              icon: (
                <svg
                  viewBox='0 0 24 24'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth={1.5}
                  className='w-[18px] h-[18px]'
                  aria-hidden='true'
                >
                  <path d='M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z' />
                  <polyline points='14,2 14,8 20,8' />
                  <line x1='16' y1='13' x2='8' y2='13' />
                  <line x1='16' y1='17' x2='8' y2='17' />
                </svg>
              ),
            },
            {
              title: 'Career Insights',
              desc: 'Ask it anything about your streams, growth trajectory, or release performance. It knows.',
              icon: (
                <svg
                  viewBox='0 0 24 24'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth={1.5}
                  className='w-[18px] h-[18px]'
                  aria-hidden='true'
                >
                  <polyline points='22,12 18,12 15,21 9,3 6,12 2,12' />
                </svg>
              ),
            },
          ].map(card => (
            <div
              key={card.title}
              className='p-5'
              style={{ background: 'var(--linear-bg-surface-0)' }}
            >
              <div
                className='mb-2'
                style={{ color: 'var(--linear-text-tertiary)' }}
              >
                {card.icon}
              </div>
              <div
                className='font-medium mb-1.5'
                style={{ fontSize: '0.85rem' }}
              >
                {card.title}
              </div>
              <p
                style={{
                  fontSize: '0.78rem',
                  color: 'var(--linear-text-tertiary)',
                  lineHeight: 1.45,
                }}
              >
                {card.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
