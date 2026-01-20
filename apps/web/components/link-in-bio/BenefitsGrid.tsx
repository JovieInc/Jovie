import { cn } from '@/lib/utils';

export function BenefitsGrid() {
  const benefits = [
    {
      emoji: '🎯',
      title: 'Highest Converting Profiles, Period',
      description:
        "Your fans don't care about button colors—they care about your music. Jovie's AI tests every word, layout, and CTA behind the scenes to make sure more fans click, listen, and buy. You focus on creating. We focus on converting.",
      metric: '47% higher conversion',
      accent: 'blue',
    },
    {
      emoji: '📊',
      title: 'Analytics You Can Trust',
      description:
        'No lag, no mismatched numbers, no "stuck" dashboards. Jovie shows you real-time, reliable insights that line up with what Meta and Spotify actually see.',
      metric: 'Real-time accuracy',
      accent: 'green',
    },
    {
      emoji: '⚡',
      title: 'Faster Than Fast',
      description:
        "Under 100ms load times, 99.99% uptime. Fans tap your link, it's open before they blink. If Linktree is a yellow light, Jovie is a green.",
      metric: '<100ms load time',
      accent: 'yellow',
    },
    {
      emoji: '🎨',
      title: 'Always Beautiful, Never Ugly',
      description:
        "We don't hand you a box of crayons and say \"good luck.\" Jovie gives you instantly polished profiles that look great out of the box—no MySpace-style button chaos. You can't make it ugly. And that's the point.",
      metric: 'Apple-level polish',
      accent: 'purple',
    },
    {
      emoji: '🔍',
      title: 'SEO That Works for You',
      description:
        'Every profile is SEO-optimized, lightning fast, and designed to rank. Jovie grows your search presence, not ours.',
      metric: '3x better discovery',
      accent: 'cyan',
    },
    {
      emoji: '📱',
      title: 'Instagram-Proof',
      description:
        "IG's new multi-link feature? Jovie makes it smarter. Deep-link straight to /listen, /tip, or /subscribe—so fans take action immediately instead of wandering through a button farm.",
      metric: '1-click actions',
      accent: 'pink',
    },
  ];

  return (
    <div className='mx-auto max-w-7xl px-6 lg:px-8'>
      <div className='mx-auto max-w-4xl text-center mb-20'>
        <h2 className='text-4xl font-semibold tracking-tight text-gray-900 dark:text-white sm:text-5xl lg:text-6xl'>
          The platform that{' '}
          <span className='text-transparent bg-gradient-to-r from-green-600 via-blue-600 to-purple-600 dark:from-green-400 dark:via-blue-400 dark:to-purple-400 bg-clip-text'>
            just works
          </span>
        </h2>

        <p className='mt-6 text-xl text-gray-600 dark:text-white/70 leading-relaxed'>
          Every element is designed to turn fans into streams. No distractions,
          just results.
        </p>
      </div>

      <div className='mx-auto max-w-7xl'>
        <div className='grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3'>
          {benefits.map(benefit => {
            return (
              <div key={benefit.title} className='relative group'>
                <div className='absolute -inset-4 bg-gradient-to-r from-white/5 to-white/10 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-500' />
                <div className='relative bg-gray-50/80 dark:bg-white/5 backdrop-blur-sm border border-gray-200 dark:border-white/10 rounded-2xl p-8 hover:border-gray-300 dark:hover:border-white/20 transition-all duration-300 h-full'>
                  {/* Emoji and title */}
                  <div className='flex items-start gap-4 mb-6'>
                    <div className='text-3xl' aria-hidden='true'>
                      {benefit.emoji}
                    </div>
                    <div className='flex-1'>
                      <h3 className='text-xl font-semibold text-gray-900 dark:text-white leading-tight'>
                        {benefit.title}
                      </h3>
                    </div>
                  </div>

                  {/* Metric badge */}
                  <div className='mb-4'>
                    <span
                      className={cn(
                        'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium',
                        'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-white/80'
                      )}
                    >
                      {benefit.metric}
                    </span>
                  </div>

                  {/* Description */}
                  <p className='text-gray-600 dark:text-white/70 leading-relaxed'>
                    {benefit.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
