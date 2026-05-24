import type { LucideIcon } from 'lucide-react';
import { RadioTower, RefreshCw, Zap } from 'lucide-react';

const GO_LIVE_STEPS: Array<{
  readonly title: string;
  readonly body: string;
  readonly Icon: LucideIcon;
}> = [
  {
    title: 'Catch The Signal',
    body: 'Jovie watches the release, store, and fan moments that usually slip past the team.',
    Icon: RadioTower,
  },
  {
    title: 'Turn It Into Action',
    body: 'A campaign prompt becomes copy, timing, creative direction, and the next best send.',
    Icon: Zap,
  },
  {
    title: 'Compound The Motion',
    body: 'Every Friday loop feeds the next one, so momentum becomes easier to repeat.',
    Icon: RefreshCw,
  },
];

export function GoLiveInSixtySection() {
  return (
    <section
      aria-labelledby='go-live-sixty-heading'
      className='relative isolate overflow-hidden bg-[#020303] py-24 text-white sm:py-28 lg:py-[7.5rem]'
      data-testid='go-live-sixty-section'
    >
      <div
        aria-hidden='true'
        className='absolute inset-x-[-18vw] top-1/2 h-px bg-gradient-to-r from-transparent via-white/16 to-transparent'
      />
      <div
        aria-hidden='true'
        className='absolute left-1/2 top-1/2 h-80 w-[80vw] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(94,106,210,0.13),transparent_64%)] blur-3xl'
      />

      <div className='relative mx-auto grid w-full max-w-[var(--homepage-section-max)] gap-12 px-[var(--homepage-page-gutter)] lg:grid-cols-[minmax(24rem,0.95fr)_minmax(0,1.05fr)] lg:items-end lg:gap-14'>
        <h2
          id='go-live-sixty-heading'
          className='max-w-[12.5ch] text-[3rem] font-semibold leading-[0.94] tracking-[-0.035em] text-white sm:text-[4.15rem] lg:text-[4.55rem] lg:leading-[0.92] xl:text-[4.95rem]'
        >
          Go Live. In 60 Seconds.
        </h2>

        <div className='grid min-w-0 gap-9 md:grid-cols-3 md:gap-6 xl:gap-8'>
          {GO_LIVE_STEPS.map(({ title, body, Icon }, index) => (
            <div key={title} className='min-w-0'>
              <div className='mb-5 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-white/70'>
                <Icon
                  aria-hidden='true'
                  className='h-4 w-4'
                  strokeWidth={1.7}
                />
              </div>
              <h3 className='text-[14px] font-medium leading-6 tracking-[-0.01em] text-white'>
                {index + 1}. {title}
              </h3>
              <p className='mt-2.5 text-[13px] leading-6 text-white/52'>
                {body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default GoLiveInSixtySection;
