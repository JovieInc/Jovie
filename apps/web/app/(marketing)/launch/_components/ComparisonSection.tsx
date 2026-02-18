import { WRAP } from './shared';

export function ComparisonSection() {
  return (
    <>
      {/* ═══ 19. COMPARISON ═══ */}
      <section aria-labelledby='comparison-heading' className={`${WRAP} pt-16`}>
        <div className='pb-8'>
          <h2
            id='comparison-heading'
            className='marketing-h2-linear max-w-[680px]'
          >
            What you get for free.{' '}
            <span className='text-secondary-token'>
              Versus what you&apos;re probably using now.
            </span>
          </h2>
        </div>
        <div className='grid grid-cols-1 md:grid-cols-2 border-t border-subtle'>
          {/* Linktree */}
          <div className='py-10 md:pr-12 md:border-r md:border-subtle'>
            <div className='uppercase tracking-wide font-medium mb-6 text-xs text-tertiary-token tracking-widest'>
              Free Linktree + nothing else
            </div>
            <ul className='list-none'>
              {[
                'Static list of links — same for every visitor',
                'No smart links — manually create each one',
                'No fan capture — zero emails, zero SMS',
                'No AI — write your own bios and press kits',
                'Linktree branding on your page',
                'No deeplinks — one link does one thing',
              ].map(item => (
                <li
                  key={item}
                  className='flex items-start gap-3 py-2.5 text-sm text-secondary-token border-b border-white/[0.04]'
                >
                  <span
                    className='shrink-0 mt-0.5 text-xs text-tertiary-token'
                    aria-hidden='true'
                  >
                    &times;
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Jovie */}
          <div className='py-10 md:pl-12'>
            <div className='uppercase tracking-wide font-medium mb-6 text-xs tracking-widest'>
              Jovie Free
            </div>
            <ul className='list-none'>
              {[
                'Adaptive CTA — subscribe or listen, per visitor',
                'Smart links auto-created for every release',
                'Email fan capture built in',
                'AI assistant with 10 queries/mo',
                'Your brand, your domain potential',
                '/tip, /tour, /contact, /listen deeplinks included',
              ].map(item => (
                <li
                  key={item}
                  className='flex items-start gap-3 py-2.5 text-sm text-secondary-token border-b border-white/[0.04]'
                >
                  <span className='shrink-0 mt-0.5 text-xs' aria-hidden='true'>
                    &check;
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
