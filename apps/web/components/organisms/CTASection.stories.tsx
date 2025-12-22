import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CTASection } from './CTASection';

const meta: Meta<typeof CTASection> = {
  title: 'Organisms/CTASection',
  component: CTASection,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['primary', 'secondary'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: 'Ready to get started?',
    description:
      'Join thousands of artists who are growing their audience and income with our platform.',
    buttonText: 'Get Started',
    buttonHref: '/signup',
    variant: 'primary',
  },
};

export const Secondary: Story = {
  args: {
    title: 'Join our community today',
    description: 'Connect with other artists and grow your career together.',
    buttonText: 'Join Now',
    buttonHref: '/community',
    variant: 'secondary',
  },
};

export const WithoutDescription: Story = {
  args: {
    title: 'Ready to take the next step?',
    buttonText: 'Get Started',
    buttonHref: '/signup',
    variant: 'primary',
  },
};

export const ShortContent: Story = {
  args: {
    title: 'Questions?',
    description: 'Our support team is here to help.',
    buttonText: 'Contact Us',
    buttonHref: '/contact',
    variant: 'primary',
  },
};

export const LongContent: Story = {
  args: {
    title: 'Join our growing community of artists and creators',
    description:
      'Our platform provides everything you need to grow your audience, connect with fans, and monetize your content. With powerful analytics, customizable profiles, and direct fan engagement tools, you can take your career to the next level.',
    buttonText: 'Start Your Journey',
    buttonHref: '/signup',
    variant: 'primary',
  },
};

export const PrimaryDarkMode: Story = {
  args: {
    ...Default.args,
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};

export const SecondaryDarkMode: Story = {
  args: {
    ...Secondary.args,
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};

export const CustomClassName: Story = {
  args: {
    ...Default.args,
    className: 'my-8 rounded-xl shadow-lg',
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className='flex flex-col gap-8'>
      <CTASection
        title='Primary Variant'
        description='This is the primary variant of the CTA section, typically used on light backgrounds.'
        buttonText='Primary Action'
        buttonHref='/action'
        variant='primary'
      />
      <CTASection
        title='Secondary Variant'
        description='This is the secondary variant of the CTA section, typically used for higher contrast.'
        buttonText='Secondary Action'
        buttonHref='/action'
        variant='secondary'
      />
    </div>
  ),
};
