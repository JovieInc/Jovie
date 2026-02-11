import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CTAButton } from '@/components/atoms/CTAButton';
import { HeroSection } from './HeroSection';

const meta: Meta<typeof HeroSection> = {
  title: 'Organisms/HeroSection',
  component: HeroSection,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  argTypes: {
    gradientVariant: {
      control: { type: 'select' },
      options: ['primary', 'secondary', 'success', 'warning', 'purple-cyan'],
    },
    showBackgroundEffects: {
      control: { type: 'boolean' },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const HomePage: Story = {
  args: {
    headline: 'Join the waitlist',
    highlightText: 'handle',
    gradientVariant: 'primary',
    subtitle: 'Your personalized link in bio, ready in seconds.',
    children: (
      <div className='flex flex-col items-center gap-4'>
        <p className='text-sm text-gray-600 dark:text-white/70'>
          Create your artist page in seconds.
        </p>
        <CTAButton href='/sign-up' variant='primary' size='lg'>
          Sign up to get started
        </CTAButton>
      </div>
    ),
    supportingText: 'Go live in 60 seconds • Free forever',
    trustIndicators: (
      <p className='text-xs text-gray-400 dark:text-white/40 font-medium'>
        Trusted by 10,000+ artists worldwide
      </p>
    ),
  },
};

export const LinkInBioPage: Story = {
  args: {
    headline: 'Jovie: Built to Convert Not to Decorate',
    highlightText: 'Convert',
    gradientVariant: 'purple-cyan',
    subtitle:
      "Your fans don't care about button colors—they care about your music. Jovie's AI tests every word, layout, and CTA behind the scenes to make sure more fans click, listen, and buy.",
    icon: '🚀',
    children: (
      <div className='flex flex-col sm:flex-row gap-6 justify-center items-center'>
        <CTAButton href='/onboarding' variant='primary' size='lg'>
          Create Your Profile
        </CTAButton>
        <CTAButton href='/pricing' variant='secondary' size='lg'>
          View Pricing
        </CTAButton>
      </div>
    ),
    supportingText: (
      <div className='flex items-center gap-2 text-gray-600 dark:text-gray-400'>
        <svg
          className='w-5 h-5 text-green-600 dark:text-green-400'
          fill='none'
          viewBox='0 0 24 24'
          stroke='currentColor'
          aria-hidden='true'
        >
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={2}
            d='M5 13l4 4L19 7'
          />
        </svg>
        <span className='text-sm'>
          You focus on creating. We focus on converting.
        </span>
      </div>
    ),
    trustIndicators: (
      <p className='text-xs text-gray-400 dark:text-white/40 font-medium'>
        Trusted by 10,000+ artists worldwide
      </p>
    ),
  },
};

export const Simple: Story = {
  args: {
    headline: 'Welcome to Jovie',
    subtitle: 'The simplest way to share your music.',
    children: (
      <CTAButton href='/get-started' variant='primary' size='lg'>
        Get Started
      </CTAButton>
    ),
  },
};

export const WithoutHighlight: Story = {
  args: {
    headline: 'Share Your Music With The World',
    subtitle: 'Connect with fans and grow your audience.',
    children: (
      <div className='flex flex-col gap-4'>
        <CTAButton href='/sign-up' variant='primary' size='lg'>
          Create Account
        </CTAButton>
        <CTAButton href='/demo' variant='outline' size='md'>
          Watch Demo
        </CTAButton>
      </div>
    ),
    trustIndicators: (
      <p className='text-xs text-gray-400 dark:text-white/40 font-medium'>
        Join thousands of artists
      </p>
    ),
  },
};

export const MinimalForm: Story = {
  args: {
    headline: 'Get Started Today',
    highlightText: 'Today',
    gradientVariant: 'success',
    subtitle: 'Join the community of successful artists.',
    children: (
      <div className='space-y-4 w-full'>
        <input
          type='email'
          placeholder='Enter your email'
          className='w-full px-4 py-3 border border-gray-300 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-transparent'
        />
        <CTAButton href='#' variant='primary' size='lg' className='w-full'>
          Join Now
        </CTAButton>
      </div>
    ),
    supportingText: 'No spam. Opt-out anytime.',
  },
};

export const WithoutBackgroundEffects: Story = {
  args: {
    headline: 'Clean and Simple',
    highlightText: 'Simple',
    subtitle: 'No fancy effects, just content.',
    showBackgroundEffects: false,
    children: (
      <CTAButton href='/clean' variant='primary' size='lg'>
        Keep It Clean
      </CTAButton>
    ),
  },
};

export const LongHeadline: Story = {
  args: {
    headline:
      'Transform Your Music Career With Professional Link in Bio Pages That Actually Convert Fans Into Loyal Listeners',
    highlightText: 'Convert',
    gradientVariant: 'purple-cyan',
    subtitle:
      'Stop losing potential fans to complicated landing pages. Our optimized design gets more clicks, more streams, and more followers.',
    children: (
      <div className='flex flex-col gap-4'>
        <CTAButton href='/transform' variant='primary' size='lg'>
          Transform My Career
        </CTAButton>
        <CTAButton href='/learn-more' variant='outline' size='md'>
          Learn More
        </CTAButton>
      </div>
    ),
    supportingText: 'Used by 10,000+ artists worldwide',
    trustIndicators: (
      <div className='flex flex-col items-center space-y-2'>
        <p className='text-xs text-gray-400 dark:text-white/40 font-medium'>
          Trusted by top artists
        </p>
        <div className='flex space-x-2'>
          {[1, 2, 3, 4, 5].map(star => (
            <svg
              key={star}
              className='w-4 h-4 text-yellow-400'
              fill='currentColor'
              viewBox='0 0 20 20'
              aria-hidden='true'
            >
              <path d='M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z' />
            </svg>
          ))}
        </div>
      </div>
    ),
  },
};
