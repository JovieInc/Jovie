import { WRAP } from './shared';

export function WhyNowSection() {
  return (
    <>
      {/* ═══ 17. TAM / WHY NOW ═══ */}
      <div className={WRAP}>
        <section
          aria-labelledby='whynow-heading'
          className='py-16 border-y border-subtle'
        >
          <h2 id='whynow-heading' className='marketing-h2-linear'>
            More creators than ever.{' '}
            <span className='text-secondary-token'>More noise than ever.</span>
          </h2>
          <p className='marketing-lead-linear mt-4 max-w-[600px]'>
            AI is creating an explosion of new music. Competition for fan
            attention has never been fiercer. Jovie is your edge.
          </p>
          <div className='grid grid-cols-1 md:grid-cols-3 gap-12 mt-8'>
            {[
              {
                val: '7M',
                label: 'tracks generated per day on Suno alone',
                source: 'Source: Suno, 2025',
              },
              {
                val: '$60.4B',
                label: 'projected AI music market by 2034, up from $5.2B today',
                source: 'Source: Market Research Future',
              },
              {
                val: '$100',
                label:
                  'lifetime value of each email subscriber you capture through Jovie',
                source: 'Internal estimate based on direct-to-fan sales',
              },
            ].map(s => (
              <div key={s.val}>
                <div className='font-medium text-[2rem] tracking-tight'>
                  {s.val}
                </div>
                <div className='mt-1.5 text-sm text-secondary-token leading-snug'>
                  {s.label}
                </div>
                <div className='mt-1 text-[0.7rem] text-tertiary-token'>
                  {s.source}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
