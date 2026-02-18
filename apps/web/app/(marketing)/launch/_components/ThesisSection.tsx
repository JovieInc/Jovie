import { WRAP } from './shared';

export function ThesisSection() {
  return (
    <>
      {/* ═══ 3. THESIS ═══ */}
      <section
        aria-labelledby='thesis-heading'
        className='pt-32 pb-16'
        id='how-it-works'
      >
        <div className={WRAP}>
          <h2 id='thesis-heading' className='marketing-h2-linear max-w-[680px]'>
            A new kind of artist tool.{' '}
            <span className='text-secondary-token'>
              Paste one Spotify link. Get smart links, fan capture, and a
              link-in-bio that converts &mdash; all in seconds.
            </span>
          </h2>
        </div>
      </section>

      {/* ═══ 4. PILLARS ═══ */}
      <div className={WRAP}>
        <div className='grid grid-cols-1 md:grid-cols-3 border-t border-subtle'>
          {[
            {
              num: 'FIG 0.1',
              title: 'One-click import',
              desc: 'Paste a Spotify URL. Jovie imports your discography, matches every release across platforms, and builds your profile automatically.',
            },
            {
              num: 'FIG 0.2',
              title: 'AI-native from day one',
              desc: 'An AI assistant grounded in your catalog, streaming data, and career. It writes bios, generates Canvases, and surfaces real insights.',
            },
            {
              num: 'FIG 0.3',
              title: 'Obsessively crafted',
              desc: "Your link-in-bio should feel like a product you're proud to share — not a parking lot of links with someone else's logo.",
            },
          ].map((item, i) => (
            <div
              key={item.num}
              className={`py-10 pr-8 ${i < 2 ? 'md:border-r md:border-subtle' : ''}`}
            >
              <div className='mb-4 font-mono tracking-wide text-xs text-tertiary-token'>
                {item.num}
              </div>
              <h3 className='font-medium mb-3 text-base tracking-tight leading-snug'>
                {item.title}
              </h3>
              <p className='text-sm leading-relaxed text-secondary-token'>
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
