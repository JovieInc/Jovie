import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { StepCard } from './StepCard';

// Sample icons
const LinkIcon = (
  <svg
    className='h-6 w-6'
    fill='none'
    viewBox='0 0 24 24'
    stroke='currentColor'
  >
    <path
      strokeLinecap='round'
      strokeLinejoin='round'
      strokeWidth={2}
      d='M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1'
    />
  </svg>
);

const LockIcon = (
  <svg
    className='h-6 w-6'
    fill='none'
    viewBox='0 0 24 24'
    stroke='currentColor'
  >
    <path
      strokeLinecap='round'
      strokeLinejoin='round'
      strokeWidth={2}
      d='M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z'
    />
  </svg>
);

const MusicIcon = (
  <svg
    className='h-6 w-6'
    fill='none'
    viewBox='0 0 24 24'
    stroke='currentColor'
  >
    <path
      strokeLinecap='round'
      strokeLinejoin='round'
      strokeWidth={2}
      d='M14.828 14.828a4 4 0 01-5.656 0M9 10h1.586a1 1 0 01.707.293l2.414 2.414a1 1 0 00.707.293H15'
    />
  </svg>
);

const meta: Meta<typeof StepCard> = {
  title: 'Atoms/StepCard',
  component: StepCard,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    showConnectionLine: {
      control: { type: 'boolean' },
    },
    interactive: {
      control: { type: 'boolean' },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    stepNumber: '01',
    title: 'Connect Your Spotify',
    description:
      'Search and verify your Spotify artist profile in seconds. We pull your latest releases automatically.',
    icon: LinkIcon,
  },
};

export const Step2: Story = {
  args: {
    stepNumber: '02',
    title: 'Get Your Link',
    description:
      'Get your custom jov.ie link and professional profile. Add your social media and merch links.',
    icon: LockIcon,
  },
};

export const Step3: Story = {
  args: {
    stepNumber: '03',
    title: 'Fans Stream Your Music',
    description:
      'Fans discover and stream your music instantly. Smart routing sends them to their preferred platform.',
    icon: MusicIcon,
  },
};

export const WithConnectionLine: Story = {
  args: {
    stepNumber: '01',
    title: 'Connect Your Spotify',
    description:
      'Search and verify your Spotify artist profile in seconds. We pull your latest releases automatically.',
    icon: LinkIcon,
    showConnectionLine: true,
  },
};

export const NonInteractive: Story = {
  args: {
    stepNumber: '01',
    title: 'Static Step Card',
    description:
      'This step card has no hover effects and is purely informational.',
    icon: LinkIcon,
    interactive: false,
  },
};

export const AllSteps: Story = {
  render: () => (
    <div className='grid grid-cols-1 md:grid-cols-3 gap-12 max-w-6xl'>
      <StepCard
        stepNumber='01'
        title='Connect Your Spotify'
        description='Search and verify your Spotify artist profile in seconds. We pull your latest releases automatically.'
        icon={LinkIcon}
        showConnectionLine={true}
      />
      <StepCard
        stepNumber='02'
        title='Get Your Link'
        description='Get your custom jov.ie link and professional profile. Add your social media and merch links.'
        icon={LockIcon}
        showConnectionLine={true}
      />
      <StepCard
        stepNumber='03'
        title='Fans Stream Your Music'
        description='Fans discover and stream your music instantly. Smart routing sends them to their preferred platform.'
        icon={MusicIcon}
      />
    </div>
  ),
};

export const InHowItWorksSection: Story = {
  render: () => (
    <div className='max-w-6xl p-8 bg-gray-50 dark:bg-gray-900 rounded-lg'>
      <div className='text-center mb-12'>
        <h2 className='text-4xl font-bold mb-4'>How It Works</h2>
        <p className='text-gray-600 dark:text-gray-300'>
          From Spotify artist to fan conversion in 60 seconds
        </p>
      </div>
      <div className='grid grid-cols-1 md:grid-cols-3 gap-12'>
        <StepCard
          stepNumber='01'
          title='Connect Your Spotify'
          description='Search and verify your Spotify artist profile in seconds. We pull your latest releases automatically.'
          icon={LinkIcon}
          showConnectionLine={true}
        />
        <StepCard
          stepNumber='02'
          title='Get Your Link'
          description='Get your custom jov.ie link and professional profile. Add your social media and merch links.'
          icon={LockIcon}
          showConnectionLine={true}
        />
        <StepCard
          stepNumber='03'
          title='Fans Stream Your Music'
          description='Fans discover and stream your music instantly. Smart routing sends them to their preferred platform.'
          icon={MusicIcon}
        />
      </div>
    </div>
  ),
};
