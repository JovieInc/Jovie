import { Eye, Heart, Music, Sparkles, Users, Zap } from 'lucide-react';
import { Container } from '@/components/site/Container';

const features = [
  {
    icon: Sparkles,
    title: 'AI-Powered Personalization',
    description: 'Every fan sees the right CTA at the right time.',
  },
  {
    icon: Users,
    title: 'Subscriber-First Design',
    description: 'Capture emails before they bounce.',
  },
  {
    icon: Eye,
    title: 'Built-In Analytics',
    description: 'Know what works without connecting tools.',
  },
  {
    icon: Music,
    title: 'Pre-Save & Release Tools',
    description: 'Streamlined workflows for release campaigns.',
  },
  {
    icon: Heart,
    title: 'Fan Relationship Tools',
    description: 'Convert casual listeners into superfans.',
  },
  {
    icon: Zap,
    title: 'Continuous Improvement',
    description: 'Your page optimizes itself over time.',
  },
];

export function WhatYouGetSection() {
  return (
    <section className='section-spacing-linear bg-base relative overflow-hidden'>
      <Container size='homepage'>
        <div className='max-w-5xl mx-auto'>
          <h2 className='marketing-h2-linear text-left mb-12'>
            Built for conversion.
          </h2>

          {/* Linear 3-column grid with 32px gaps */}
          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 section-gap-linear'>
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div key={index} className='flex items-start gap-3'>
                  {/* Linear 16px icon variant */}
                  <div className='flex items-center justify-center w-4 h-4 shrink-0 mt-1'>
                    <Icon className='w-4 h-4 text-tertiary-token' />
                  </div>
                  <div className='space-y-1'>
                    <h3 className='text-sm font-medium text-primary-token'>
                      {feature.title}
                    </h3>
                    <p className='text-sm leading-relaxed text-tertiary-token'>
                      {feature.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Container>
    </section>
  );
}
