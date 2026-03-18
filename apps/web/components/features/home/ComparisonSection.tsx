export function SocialProofSection() {
  const testimonials = [
    {
      quote:
        'Jovie turned my profile from a dead end into a conversion machine. My streams went up 47% in the first month.',
      author: 'Sarah Chen',
      role: 'Indie Artist',
      avatar: 'SC',
      metric: '+47% streams',
    },
    {
      quote:
        'Finally, a profile that actually works. My fans can find my music instantly without getting lost.',
      author: 'Marcus Rodriguez',
      role: 'Hip-Hop Producer',
      avatar: 'MR',
      metric: '0.8s load time',
    },
    {
      quote:
        'The smart routing feature is genius. My fans go straight to their favorite platform. No more confusion.',
      author: 'Emma Thompson',
      role: 'Pop Singer',
      avatar: 'ET',
      metric: '1-click streaming',
    },
  ];

  const stats = [
    { number: '10,000+', label: 'Artists using Jovie' },
    { number: '1M+', label: 'Fans converted to streams' },
    { number: '99.9%', label: 'Uptime guarantee' },
    { number: '47%', label: 'Average conversion increase' },
  ];

  return (
    <section className='relative py-24 sm:py-32'>
      <div className='mx-auto max-w-7xl px-6 lg:px-8'>
        <div className='mx-auto max-w-3xl text-center mb-16'>
          <div className='mb-8'>
            <div className='inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-sm font-medium text-blue-400'>
              <svg
                className='w-4 h-4'
                fill='none'
                viewBox='0 0 24 24'
                stroke='currentColor'
                aria-hidden='true'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z'
                />
              </svg>
              Trusted by Musicians
            </div>
          </div>

          <h2 className='text-4xl font-medium tracking-tight text-primary-token sm:text-5xl lg:text-6xl'>
            Musicians love Jovie
          </h2>

          <p className='mt-6 text-xl text-secondary-token'>
            Join thousands of artists who&apos;ve transformed their fan
            experience
          </p>
        </div>

        {/* Stats */}
        <div className='mx-auto max-w-4xl mb-16'>
          <div className='grid grid-cols-2 md:grid-cols-4 gap-8'>
            {stats.map(stat => (
              <div key={stat.label} className='text-center'>
                <div className='text-3xl font-bold text-primary-token'>
                  {stat.number}
                </div>
                <div className='text-sm text-tertiary-token mt-1'>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Testimonials */}
        <div className='mx-auto max-w-6xl'>
          <div className='grid grid-cols-1 md:grid-cols-3 gap-8'>
            {testimonials.map(testimonial => (
              <div key={testimonial.author} className='relative group'>
                <div className='absolute -inset-4 bg-linear-to-r from-white/5 to-white/10 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-500' />
                <div className='relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 hover:border-white/20 transition-all duration-300'>
                  <div className='mb-6'>
                    <span className='inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400'>
                      {testimonial.metric}
                    </span>
                  </div>

                  <blockquote className='text-primary-token leading-relaxed mb-6'>
                    &ldquo;{testimonial.quote}&rdquo;
                  </blockquote>

                  <div className='flex items-center'>
                    <div className='w-10 h-10 rounded-full bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm'>
                      {testimonial.avatar}
                    </div>
                    <div className='ml-3'>
                      <div className='text-primary-token font-medium'>
                        {testimonial.author}
                      </div>
                      <div className='text-tertiary-token text-sm'>
                        {testimonial.role}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
