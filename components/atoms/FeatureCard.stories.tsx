import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FeatureCard } from './FeatureCard';

// Sample icons
const LightningIcon = (
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
      d='M13 10V3L4 14h7v7l9-11h-7z'
    />
  </svg>
);

const ChartIcon = (
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
      d='M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z'
    />
  </svg>
);

const BulbIcon = (
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
      d='M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z'
    />
  </svg>
);

const meta: Meta<typeof FeatureCard> = {
  title: 'Atoms/FeatureCard',
  component: FeatureCard,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    accent: {
      control: { type: 'select' },
      options: ['blue', 'green', 'purple', 'orange', 'red', 'gray'],
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
    title: '3.2x Faster Loading',
    description: 'Fans discover your music instantly. No waiting, no bouncing.',
    metric: '0.8s load time',
    icon: LightningIcon,
    accent: 'blue',
  },
};

export const Green: Story = {
  args: {
    title: '47% More Streams',
    description: 'Optimized for conversion. Fans click and stream immediately.',
    metric: '+47% conversion',
    icon: ChartIcon,
    accent: 'green',
  },
};

export const Purple: Story = {
  args: {
    title: 'Smart Fan Routing',
    description:
      "Remembers each fan's favorite platform. One click to their preferred streaming service.",
    metric: '1-click streaming',
    icon: BulbIcon,
    accent: 'purple',
  },
};

export const WithoutMetric: Story = {
  args: {
    title: 'Simple Feature',
    description:
      'This is a feature card without a metric badge to show the layout.',
    icon: LightningIcon,
    accent: 'blue',
  },
};

export const NonInteractive: Story = {
  args: {
    title: 'Static Card',
    description: 'This card has no hover effects and is purely informational.',
    metric: 'No hover',
    icon: ChartIcon,
    accent: 'gray',
    interactive: false,
  },
};

export const AllAccents: Story = {
  render: () => (
    <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl'>
      <FeatureCard
        title='Blue Accent'
        description='This card uses the blue accent color for the icon background.'
        metric='Blue'
        icon={LightningIcon}
        accent='blue'
      />
      <FeatureCard
        title='Green Accent'
        description='This card uses the green accent color for the icon background.'
        metric='Green'
        icon={ChartIcon}
        accent='green'
      />
      <FeatureCard
        title='Purple Accent'
        description='This card uses the purple accent color for the icon background.'
        metric='Purple'
        icon={BulbIcon}
        accent='purple'
      />
      <FeatureCard
        title='Orange Accent'
        description='This card uses the orange accent color for the icon background.'
        metric='Orange'
        icon={LightningIcon}
        accent='orange'
      />
      <FeatureCard
        title='Red Accent'
        description='This card uses the red accent color for the icon background.'
        metric='Red'
        icon={ChartIcon}
        accent='red'
      />
      <FeatureCard
        title='Gray Accent'
        description='This card uses the gray accent color for the icon background.'
        metric='Gray'
        icon={BulbIcon}
        accent='gray'
      />
    </div>
  ),
};

export const InBenefitsSection: Story = {
  render: () => (
    <div className='max-w-6xl p-8 bg-gray-50 dark:bg-gray-900 rounded-lg'>
      <div className='text-center mb-12'>
        <h2 className='text-4xl font-bold mb-4'>Benefits Section</h2>
        <p className='text-gray-600 dark:text-gray-300'>
          See how feature cards work together in a benefits section
        </p>
      </div>
      <div className='grid grid-cols-1 md:grid-cols-3 gap-8'>
        <FeatureCard
          title='3.2x Faster Loading'
          description='Fans discover your music instantly. No waiting, no bouncing.'
          metric='0.8s load time'
          icon={LightningIcon}
          accent='blue'
        />
        <FeatureCard
          title='47% More Streams'
          description='Optimized for conversion. Fans click and stream immediately.'
          metric='+47% conversion'
          icon={ChartIcon}
          accent='green'
        />
        <FeatureCard
          title='Smart Fan Routing'
          description="Remembers each fan's favorite platform. One click to their preferred streaming service."
          metric='1-click streaming'
          icon={BulbIcon}
          accent='purple'
        />
      </div>
    </div>
  ),
};
