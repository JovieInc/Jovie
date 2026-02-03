import { Brain, Sparkles, User } from 'lucide-react';
import Link from 'next/link';
import { Container } from '@/components/site/Container';
import { BRAND } from '@/constants/app';

const brandPillars = [
  {
    icon: Sparkles,
    name: BRAND.name,
    tagline: 'The AI that knows music',
    description:
      'Not a generic AI. Built from the ground up to understand artists, fans, and what makes music careers grow.',
    iconColor: 'text-accent',
  },
  {
    icon: User,
    name: BRAND.product.name,
    tagline: BRAND.product.tagline,
    description:
      'One link that captures fans, routes them to their preferred platform, and updates itself with every release.',
    href: '/profiles',
    iconColor: 'text-violet-500',
  },
  {
    icon: Brain,
    name: BRAND.ai.name,
    tagline: BRAND.ai.description,
    description:
      'Every visit teaches Jovie what works for your audience. Personalized CTAs, automatic A/B testing, cross-artist learning.',
    href: '/ai',
    iconColor: 'text-blue-500',
  },
];

export function BrandPromiseSection() {
  return (
    <section
      id='brand-promise'
      className='section-spacing-linear bg-base relative overflow-hidden'
    >
      <Container size='homepage'>
        <div className='max-w-5xl mx-auto'>
          <div className='text-center mb-12'>
            <h2 className='marketing-h2-linear'>One name. Three superpowers.</h2>
            <p className='mt-4 text-secondary-token text-base max-w-xl mx-auto'>
              Everything you need to turn listeners into a career.
            </p>
          </div>

          <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
            {brandPillars.map(pillar => {
              const Icon = pillar.icon;
              const content = (
                <div className='group p-6 rounded-xl border border-subtle bg-surface-0 hover:border-accent/30 transition-colors h-full'>
                  <div className='flex items-center gap-3 mb-4'>
                    <div className='flex items-center justify-center w-8 h-8 rounded-lg bg-surface-1'>
                      <Icon className={`w-4 h-4 ${pillar.iconColor}`} />
                    </div>
                    <h3 className='text-base font-medium text-primary-token'>
                      {pillar.name}
                    </h3>
                  </div>
                  <p className='text-sm font-medium text-accent mb-2'>
                    {pillar.tagline}
                  </p>
                  <p className='text-sm leading-relaxed text-tertiary-token'>
                    {pillar.description}
                  </p>
                </div>
              );

              if (pillar.href) {
                return (
                  <Link
                    key={pillar.name}
                    href={pillar.href}
                    className='block h-full'
                  >
                    {content}
                  </Link>
                );
              }

              return <div key={pillar.name}>{content}</div>;
            })}
          </div>
        </div>
      </Container>
    </section>
  );
}
