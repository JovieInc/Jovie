import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { AnalyticsCard } from '../atoms/AnalyticsCard';

// Create a mock version of the component for Storybook
const MockAnalyticsCards = ({
  totalClicks = 1250,
  spotifyClicks = 750,
  socialClicks = 350,
  recentClicks = 120,
  loading = false,
  error = false,
  numberOfCards = 4,
}) => {
  // Define the cards data
  const cards = [
    {
      id: 'total_clicks',
      title: 'Total Clicks',
      value: totalClicks,
      metadata: 'Last 30 days',
    },
    {
      id: 'spotify_clicks',
      title: 'Spotify Clicks',
      value: spotifyClicks,
      metadata: 'Music platform clicks',
    },
    {
      id: 'social_clicks',
      title: 'Social Clicks',
      value: socialClicks,
      metadata: 'Social media clicks',
    },
    {
      id: 'recent_activity',
      title: 'Recent Activity',
      value: recentClicks,
      metadata: 'Last 7 days',
    },
  ].slice(0, numberOfCards);

  if (loading) {
    return (
      <div className='grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4'>
        {cards.map(card => (
          <AnalyticsCard key={card.id} title='Loading...' value='...' />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className='text-center text-red-600'>
        <p>Failed to load analytics</p>
      </div>
    );
  }

  return (
    <div className='grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4'>
      {cards.map(card => (
        <AnalyticsCard
          key={card.id}
          title={card.title}
          value={card.value}
          metadata={card.metadata}
        />
      ))}
    </div>
  );
};

const meta: Meta<typeof MockAnalyticsCards> = {
  title: 'Dashboard/Molecules/AnalyticsCards',
  component: MockAnalyticsCards,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A grid of analytics cards displaying various metrics. This component fetches data from the Supabase database and displays it in a responsive grid layout.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    totalClicks: {
      control: { type: 'number' },
      description: 'Total number of clicks in the last 30 days',
    },
    spotifyClicks: {
      control: { type: 'number' },
      description: 'Number of Spotify clicks',
    },
    socialClicks: {
      control: { type: 'number' },
      description: 'Number of social media clicks',
    },
    recentClicks: {
      control: { type: 'number' },
      description: 'Number of clicks in the last 7 days',
    },
    loading: {
      control: { type: 'boolean' },
      description: 'Whether the component is in a loading state',
    },
    error: {
      control: { type: 'boolean' },
      description: 'Whether to show an error state',
    },
    numberOfCards: {
      control: { type: 'range', min: 1, max: 4, step: 1 },
      description: 'Number of cards to display',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Default story with mock data
export const Default: Story = {
  args: {
    totalClicks: 1250,
    spotifyClicks: 750,
    socialClicks: 350,
    recentClicks: 120,
    loading: false,
    error: false,
    numberOfCards: 4,
  },
};

// Loading state
export const Loading: Story = {
  args: {
    ...Default.args,
    loading: true,
  },
};

// Error state
export const Error: Story = {
  args: {
    ...Default.args,
    error: true,
  },
};

// Empty state (zero values)
export const EmptyState: Story = {
  args: {
    ...Default.args,
    totalClicks: 0,
    spotifyClicks: 0,
    socialClicks: 0,
    recentClicks: 0,
  },
};

// Different number of cards
export const TwoCards: Story = {
  args: {
    ...Default.args,
    numberOfCards: 2,
  },
};

export const ThreeCards: Story = {
  args: {
    ...Default.args,
    numberOfCards: 3,
  },
};

// Responsive layout demonstration
export const ResponsiveLayout: Story = {
  render: () => (
    <div className='space-y-8'>
      <div>
        <h3 className='text-lg font-semibold mb-2'>Desktop View (4 columns)</h3>
        <div className='w-full'>
          <MockAnalyticsCards
            totalClicks={1250}
            spotifyClicks={750}
            socialClicks={350}
            recentClicks={120}
          />
        </div>
      </div>

      <div>
        <h3 className='text-lg font-semibold mb-2'>Tablet View (2 columns)</h3>
        <div className='w-[768px] mx-auto'>
          <MockAnalyticsCards
            totalClicks={1250}
            spotifyClicks={750}
            socialClicks={350}
            recentClicks={120}
          />
        </div>
      </div>

      <div>
        <h3 className='text-lg font-semibold mb-2'>Mobile View (1 column)</h3>
        <div className='w-[375px] mx-auto'>
          <MockAnalyticsCards
            totalClicks={1250}
            spotifyClicks={750}
            socialClicks={350}
            recentClicks={120}
          />
        </div>
      </div>
    </div>
  ),
};

// Dark mode demonstration
export const DarkMode: Story = {
  render: () => (
    <div className='grid grid-cols-1 md:grid-cols-2 gap-8'>
      <div className='p-6 bg-white rounded-lg'>
        <h3 className='text-lg font-semibold mb-4'>Light Theme</h3>
        <MockAnalyticsCards
          totalClicks={1250}
          spotifyClicks={750}
          socialClicks={350}
          recentClicks={120}
        />
      </div>
      <div className='p-6 bg-gray-900 rounded-lg'>
        <h3 className='text-lg font-semibold mb-4 text-white'>Dark Theme</h3>
        <div className='dark'>
          <MockAnalyticsCards
            totalClicks={1250}
            spotifyClicks={750}
            socialClicks={350}
            recentClicks={120}
          />
        </div>
      </div>
    </div>
  ),
};
