import type { ProfileAeoContent as ProfileAeoContentModel } from '@/lib/profile/aeo-content';

interface ProfileAeoContentProps {
  readonly content: ProfileAeoContentModel;
}

export function ProfileAeoContent({ content }: ProfileAeoContentProps) {
  return (
    <section
      aria-labelledby='profile-aeo-heading'
      className='bg-[color:var(--profile-stage-bg,#08090a)] px-4 py-10 text-white sm:px-6 lg:px-8'
      data-testid='profile-aeo-content'
    >
      <div className='mx-auto max-w-3xl space-y-8'>
        <div className='space-y-3'>
          <h2
            id='profile-aeo-heading'
            className='text-xl font-semibold leading-tight text-white'
          >
            About {content.artistName}
          </h2>
          <div className='space-y-3 text-mid leading-7 text-white/72'>
            {content.description.map(paragraph => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </div>

        <div className='space-y-4'>
          <h3 className='text-base font-semibold leading-tight text-white'>
            {content.artistName} FAQ
          </h3>
          <dl className='divide-y divide-white/10 border-y border-white/10'>
            {content.faqs.map(item => (
              <div key={item.question} className='py-4'>
                <dt className='text-mid font-semibold leading-6 text-white'>
                  {item.question}
                </dt>
                <dd className='mt-2 text-sm leading-6 text-white/68'>
                  <span>{item.answer}</span>{' '}
                  <a
                    href={item.source.href}
                    className='font-medium text-white underline decoration-white/30 underline-offset-4 transition-colors duration-subtle hover:text-white/82 hover:decoration-white/50'
                  >
                    Source: {item.source.label}
                  </a>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
