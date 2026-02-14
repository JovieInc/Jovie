export function ComparisonSection() {
  const comparisons = [
    {
      category: 'Design Philosophy',
      linktree: 'Templates & clutter',
      jovie: 'AI-optimized conversion machines',
    },
    {
      category: 'Visual Appeal',
      linktree: 'Ugly MySpace vibes',
      jovie: 'Apple-level polish, instantly',
    },
    {
      category: 'User Experience',
      linktree: 'Extra clicks, lost fans',
      jovie: 'Direct actions, more plays, more money',
    },
    {
      category: 'Performance',
      linktree: 'Slow loading, high bounce rates',
      jovie: 'Under 100ms load times, 99.99% uptime',
    },
    {
      category: 'Analytics',
      linktree: 'Basic metrics, delayed data',
      jovie: 'Real-time insights that match platform data',
    },
    {
      category: 'Customization',
      linktree: 'Overwhelming options, amateur results',
      jovie: 'Smart defaults, professional outcomes',
    },
  ];

  return (
    <div className='mx-auto max-w-7xl px-6 lg:px-8'>
      <div className='mx-auto max-w-4xl text-center mb-20'>
        <div className='mb-8'>
          <div className='inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/10 border border-red-500/20 text-sm font-medium text-red-400'>
            🆚 Comparison
          </div>
        </div>

        <h2 className='text-4xl font-semibold tracking-tight text-primary-token sm:text-5xl lg:text-6xl'>
          Jovie vs. Linktree
        </h2>

        <p className='mt-6 text-xl text-gray-600 dark:text-white/70'>
          Why settle for mediocre when you can have exceptional?
        </p>
      </div>

      <div className='mx-auto max-w-5xl'>
        <div className='bg-surface-1/80 backdrop-blur-sm border border-subtle rounded-2xl overflow-hidden'>
          {/* Header */}
          <div className='grid grid-cols-3 gap-0 bg-surface-1/80'>
            <div className='p-6 font-semibold text-primary-token'>Feature</div>
            <div className='p-6 font-semibold text-secondary-token border-l border-subtle'>
              Linktree
            </div>
            <div className='p-6 font-semibold text-transparent bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text border-l border-subtle'>
              Jovie
            </div>
          </div>

          {/* Comparison rows */}
          {comparisons.map((comparison, index) => (
            <div
              key={comparison.category}
              className={`grid grid-cols-3 gap-0 ${
                index === comparisons.length - 1 ? '' : 'border-b border-subtle'
              }`}
            >
              <div className='p-6 font-medium text-primary-token'>
                {comparison.category}
              </div>
              <div className='p-6 text-secondary-token border-l border-subtle'>
                {comparison.linktree}
              </div>
              <div className='p-6 text-primary-token font-medium border-l border-subtle bg-gradient-to-r from-blue-500/5 to-purple-500/5'>
                {comparison.jovie}
              </div>
            </div>
          ))}
        </div>

        {/* Summary statement */}
        <div className='mt-12 text-center'>
          <div className='mx-auto max-w-3xl bg-gradient-to-r from-blue-600/10 via-purple-600/10 to-cyan-600/10 dark:from-blue-400/10 dark:via-purple-400/10 dark:to-cyan-400/10 rounded-2xl p-8 border border-blue-200/20 dark:border-blue-400/20'>
            <p className='text-xl font-medium text-primary-token leading-relaxed'>
              <span className='text-transparent bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text font-semibold'>
                Bottom line:
              </span>{' '}
              Linktree is where creativity goes to die. Jovie is where it comes
              alive and starts making money.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
