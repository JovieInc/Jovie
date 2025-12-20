import {
  Sparkles,
  Users,
  Eye,
  Music,
  TrendingUp,
  Heart,
  Zap,
} from 'lucide-react';
import { Container } from '@/components/site/Container';

const features = [
  {
    title: 'A clean, beautiful artist page',
    description:
      'A modern, fast link-in-bio that works in light and dark mode and looks good everywhere.',
    icon: Sparkles,
  },
  {
    title: 'Smart fan capture',
    description:
      'New visitors are guided to subscribe by email or SMS before anything else.',
    icon: Users,
  },
  {
    title: 'Audience visibility',
    description:
      "See how many people visit your page, who they are, where they're from, and what device they're on.",
    icon: Eye,
  },
  {
    title: 'One-click listening',
    description:
      'Returning fans are guided directly to listen on Spotify, Apple Music, YouTube, or wherever they prefer.',
    icon: Music,
  },
  {
    title: 'Continuous optimization',
    description:
      'The page automatically tests and adapts over time to improve conversions.',
    icon: TrendingUp,
  },
  {
    title: 'Optional tipping',
    description:
      'Share a clean tip link that lets fans support you instantly via Venmo.',
    icon: Heart,
  },
  {
    title: 'Zero setup',
    description: 'Your profile is created for you. Sign in and it's ready.',
    icon: Zap,
  },
];

export function WhatYouGetSection() {
  return (
    <section className='py-16 sm:py-20 lg:py-24 bg-base'>
      <Container size='homepage'>
        <div className='max-w-3xl mx-auto text-center mb-12'>
          <h2 className='text-3xl sm:text-4xl font-medium tracking-tight text-primary-token mb-4'>
            Everything you need to convert fans — nothing you don't.
          </h2>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12'>
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div key={index} className='space-y-3'>
                <div className='flex items-start gap-3'>
                  <Icon className='h-5 w-5 text-secondary-token mt-0.5 flex-shrink-0' />
                  <div>
                    <h3 className='text-lg font-medium text-primary-token mb-2'>
                      {feature.title}
                    </h3>
                    <p className='text-base text-secondary-token leading-relaxed'>
                      {feature.description}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}

