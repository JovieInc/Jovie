import { Divider, WRAP } from './shared';

export function FlywheelSection() {
  return (
    <>
      {/* ═══ 18. FLYWHEEL / MOAT ═══ */}
      <div className={WRAP}>
        <Divider />
        <section
          aria-labelledby='flywheel-heading'
          className='section-spacing-linear grid grid-cols-1 md:grid-cols-2 gap-x-16 items-start'
        >
          <div>
            <h2
              id='flywheel-heading'
              className='marketing-h2-linear max-w-[440px]'
            >
              Gets smarter{' '}
              <span className='text-secondary-token'>with every artist</span>
            </h2>
          </div>
          <div className='pt-1'>
            <p className='marketing-lead-linear max-w-[480px]'>
              Every artist who connects adds data to Jovie&apos;s model &mdash;
              better matching, smarter routing, better AI for everyone. Linktree
              has links. Jovie has a flywheel.
            </p>
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-x-8 mt-10 pt-6 border-t border-subtle'>
              {[
                { num: '6.1', title: 'Catalog Intelligence' },
                { num: '6.2', title: 'Cross-Artist Patterns' },
                { num: '6.3', title: 'Platform Match Accuracy' },
                { num: '6.4', title: 'Smart Routing Model' },
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
    </>
  );
}
