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
      className='relative isolate overflow-hidden bg-[#020303] pb-24 pt-32 text-white sm:py-28 lg:py-32'
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

      <div className='relative mx-auto grid w-full max-w-[var(--homepage-section-max)] gap-16 px-[var(--homepage-page-gutter)] lg:grid-cols-[minmax(16rem,0.78fr)_1.22fr] lg:items-end'>
        <h2
          id='go-live-sixty-heading'
          className='max-w-[8.8ch] text-[3.15rem] font-semibold leading-[0.92] text-white sm:text-[4.75rem] lg:text-[6.45rem] lg:leading-[0.9]'
        >
          Go Live. In 60 Seconds.
        </h2>

        <div className='grid gap-10 md:grid-cols-3 md:gap-8'>
          {GO_LIVE_STEPS.map(({ title, body, Icon }, index) => (
            <div key={title} className='min-w-0'>
              <div className='mb-6 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-white/70'>
                <Icon
                  aria-hidden='true'
                  className='h-4 w-4'
                  strokeWidth={1.7}
                />
              </div>
              <h3 className='text-[15px] font-medium leading-6 text-white'>
                {index + 1}. {title}
              </h3>
              <p className='mt-3 text-[14px] leading-6 text-white/50'>{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default GoLiveInSixtySection;
