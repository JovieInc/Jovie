import { BarChart3, Mail, Palette, RefreshCw } from 'lucide-react';
import { Container } from '@/components/site/Container';

const features = [
  {
    icon: RefreshCw,
    title: 'Auto-updating profile essentials',
    description: 'Keep your profile current without constant manual updates.',
    iconColor: '#3b82f6', // blue
  },
  {
    icon: Mail,
    title: 'Built-in fan capture',
    description:
      'Capture email and SMS in a clean flow that respects fan attention.',
    iconColor: '#8b5cf6', // violet
  },
  {
    icon: Palette,
    title: 'Premium by default',
    description:
      'Use a refined layout that looks credible from your first campaign.',
    iconColor: '#ec4899', // pink
  },
  {
    icon: BarChart3,
    title: 'Actionable analytics',
    description:
      'Understand what drives clicks and conversion so every update has a reason.',
    iconColor: '#f59e0b', // amber
  },
];

export function WhatYouGetSection() {
  return (
    <section
      className='section-spacing-linear relative overflow-hidden'
      style={{ backgroundColor: 'var(--linear-bg-page)' }}
    >
      <Container size='homepage'>
        <div className='max-w-5xl mx-auto'>
          <h2
            className='text-center heading-gap-linear'
            style={{
              fontSize: 'var(--linear-h2-size)',
              fontWeight: 'var(--linear-font-weight-medium)',
              lineHeight: 'var(--linear-h2-leading)',
              letterSpacing: 'var(--linear-h2-tracking)',
              color: 'var(--linear-text-primary)',
            }}
          >
            What you get
          </h2>

          <div
            className='grid grid-cols-1 sm:grid-cols-2 max-w-2xl mx-auto'
            style={{ gap: 'var(--linear-space-10)' }}
          >
            {features.map(feature => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className='flex items-start'
                  style={{ gap: 'var(--linear-space-3)' }}
                >
                  <div className='flex items-center justify-center w-4 h-4 shrink-0 mt-1'>
                    <Icon
                      className='w-4 h-4'
                      style={{ color: feature.iconColor }}
                    />
                  </div>
                  <div>
                    <h3
                      style={{
                        fontSize: 'var(--linear-body-sm-size)',
                        fontWeight: 'var(--linear-font-weight-medium)',
                        color: 'var(--linear-text-primary)',
                        marginBottom: 'var(--linear-space-1)',
                      }}
                    >
                      {feature.title}
                    </h3>
                    <p
                      style={{
                        fontSize: 'var(--linear-body-sm-size)',
                        lineHeight: 1.6,
                        color: 'var(--linear-text-tertiary)',
                      }}
                    >
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
