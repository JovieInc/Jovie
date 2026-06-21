import type { ProfileAeoContent as ProfileAeoContentModel } from '@/lib/profile/aeo-content';

interface ProfileAeoContentProps {
  readonly content: ProfileAeoContentModel;
}

export function ProfileAeoContent({ content }: ProfileAeoContentProps) {
  return (
    <section
      aria-labelledby='profile-aeo-heading'
      className='profile-aeo-content px-4 py-10 sm:px-6 lg:px-8'
      data-testid='profile-aeo-content'
    >
      <div className='mx-auto max-w-3xl space-y-8'>
        <div className='space-y-3'>
          <h2
            id='profile-aeo-heading'
            className='profile-aeo-content__heading text-xl font-semibold leading-tight'
          >
            About {content.artistName}
          </h2>
          <div className='profile-aeo-content__body space-y-3 text-mid leading-7'>
            {content.description.map(paragraph => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </div>

        <div className='space-y-4'>
          <h3 className='profile-aeo-content__subheading text-base font-semibold leading-tight'>
            {content.artistName} FAQ
          </h3>
          <dl className='profile-aeo-content__faq-list divide-y border-y'>
            {content.faqs.map(item => (
              <div key={item.question} className='py-4'>
                <dt className='profile-aeo-content__term text-mid font-semibold leading-6'>
                  {item.question}
                </dt>
                <dd className='profile-aeo-content__answer mt-2 text-sm leading-6'>
                  <span>{item.answer}</span>{' '}
                  <a
                    href={item.source.href}
                    className='profile-aeo-content__source font-medium underline underline-offset-4 transition-colors duration-subtle'
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
