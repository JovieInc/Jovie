import { ArrowRight, Disc3, Headphones, Users } from 'lucide-react';
import Link from 'next/link';
import { Container } from '@/components/site/Container';

const useCases = [
  {
    icon: Disc3,
    title: 'For Artists',
    description: 'From your first release to your millionth stream',
    href: '/for-artists',
    iconColor: 'text-accent',
    available: false,
  },
  {
    icon: Users,
    title: 'For Labels',
    description: 'Manage every artist from one dashboard',
    href: '/for-labels',
    iconColor: 'text-violet-500',
    available: false,
  },
  {
    icon: Headphones,
    title: 'For DJs',
    description: 'From the booth to the inbox',
    href: '/for-djs',
    iconColor: 'text-blue-500',
    available: false,
  },
];

export function UseCasesSection() {
  return (
    <section className='section-spacing-linear bg-base relative overflow-hidden'>
      <Container size='homepage'>
        <div className='max-w-5xl mx-auto'>
          <div className='text-center mb-12'>
            <h2 className='marketing-h2-linear'>Built for music. Nothing else.</h2>
            <p className='mt-4 text-secondary-token text-base max-w-xl mx-auto'>
              Not creators. Not influencers. Just artists who want to build real
              careers.
            </p>
          </div>

          <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
            {useCases.map(useCase => {
              const Icon = useCase.icon;
              const content = (
                <div className='group p-6 rounded-xl border border-subtle bg-surface-0 hover:border-accent/30 transition-colors h-full flex flex-col'>
                  <div className='flex items-center justify-center w-12 h-12 rounded-xl bg-surface-1 mb-4'>
                    <Icon className={`w-6 h-6 ${useCase.iconColor}`} />
                  </div>
                  <h3 className='text-base font-medium text-primary-token mb-2'>
                    {useCase.title}
                  </h3>
                  <p className='text-sm leading-relaxed text-tertiary-token flex-1'>
                    {useCase.description}
                  </p>
                  {useCase.available ? (
                    <div className='mt-4 flex items-center gap-1 text-sm font-medium text-accent group-hover:gap-2 transition-all'>
                      Learn more
                      <ArrowRight className='w-3.5 h-3.5' />
                    </div>
                  ) : (
                    <div className='mt-4 text-xs font-medium text-tertiary-token'>
                      Coming soon
                    </div>
                  )}
                </div>
              );

              if (useCase.available) {
                return (
                  <Link
                    key={useCase.title}
                    href={useCase.href}
                    className='block h-full'
                  >
                    {content}
                  </Link>
                );
              }

              return <div key={useCase.title}>{content}</div>;
            })}
          </div>
        </div>
      </Container>
    </section>
  );
}
