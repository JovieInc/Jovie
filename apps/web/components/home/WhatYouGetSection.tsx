import { BarChart3, Mail, Palette, RefreshCw } from 'lucide-react';
import { Container } from '@/components/site/Container';

const features = [
  {
    icon: RefreshCw,
    title: 'Auto-updating',
    description: 'New releases sync instantly. Nothing to manage.',
    iconColor: 'text-blue-500',
  },
  {
    icon: Mail,
    title: 'Built-in fan capture',
    description: 'Email and SMS on every visit. Automatic.',
    iconColor: 'text-violet-500',
  },
  {
    icon: Palette,
    title: 'Beautiful by default',
    description: 'One design, perfected. No choices, no guesswork.',
    iconColor: 'text-pink-500',
  },
  {
    icon: BarChart3,
    title: 'Simple analytics',
    description: 'Know who visits and what converts.',
    iconColor: 'text-amber-500',
  },
];

export function WhatYouGetSection() {
  return (
    <section className='section-spacing-linear bg-base relative overflow-hidden'>
      <Container size='homepage'>
        <div className='max-w-5xl mx-auto'>
          <h2 className='marketing-h2-linear text-center mb-12'>
            What you get
          </h2>

          <div className='grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl mx-auto'>
            {features.map(feature => {
              const Icon = feature.icon;
              return (
                <div key={feature.title} className='flex items-start gap-3'>
                  {/* Linear 16px icon variant with accent color */}
                  <div className='flex items-center justify-center w-4 h-4 shrink-0 mt-1'>
                    <Icon className={`w-4 h-4 ${feature.iconColor}`} />
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
