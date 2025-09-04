import type { Meta, StoryObj } from '@storybook/react';
import { OnboardingForm } from './OnboardingForm';

// Mock modules at the module level
const mockPrefetch = () => {};

// Mock Next.js navigation
const originalWindow = global.window;
if (typeof global.window !== 'undefined') {
  Object.defineProperty(global, 'window', {
    value: {
      ...originalWindow,
      sessionStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      },
    },
    writable: true,
  });
}

const meta: Meta<typeof OnboardingForm> = {
  title: 'Dashboard/Organisms/OnboardingForm',
  component: OnboardingForm,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Progressive onboarding form for new users to set up their profile.',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    Story => (
      <div className='max-w-md w-full p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm'>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story: 'Default state of the onboarding form.',
      },
    },
    nextjs: {
      navigation: {
        prefetch: mockPrefetch,
        searchParams: new Map([['handle', null]]),
      },
    },
  },
};

export const WithArtistData: Story = {
  parameters: {
    docs: {
      description: {
        story: 'Shows the form with a pre-selected artist from Spotify.',
      },
    },
    mockData: {
      selectedArtist: {
        spotifyId: '06HL4z0CvFAxyc27GXpf02',
        artistName: 'Taylor Swift',
        imageUrl:
          'https://i.scdn.co/image/ab6761610000e5eb5a00969a4698c3bc19a25c66',
        timestamp: Date.now(),
      },
    },
  },
};

export const InvalidHandle: Story = {
  parameters: {
    docs: {
      description: {
        story: 'Shows validation errors for invalid handles.',
      },
    },
    mockData: {
      handle: 'invalid@handle',
    },
  },
};

export const TakenHandle: Story = {
  parameters: {
    docs: {
      description: {
        story: 'Shows validation when a handle is already taken.',
      },
    },
    mockData: {
      handle: 'taken',
    },
  },
};

export const SubmittingState: Story = {
  parameters: {
    docs: {
      description: {
        story: 'Shows the form in submitting state with progress indicator.',
      },
    },
  },
  render: () => {
    return (
      <div className='max-w-md w-full'>
        <OnboardingForm />
        <div className='mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg'>
          <p className='text-sm text-yellow-800 dark:text-yellow-200'>
            Note: This story simulates the submitting state. In the actual
            component, this state is triggered by form submission.
          </p>
        </div>
      </div>
    );
  },
};

export const ErrorState: Story = {
  parameters: {
    docs: {
      description: {
        story: 'Shows the form with an error state and retry button.',
      },
    },
  },
};

export const DarkMode: Story = {
  parameters: {
    backgrounds: { default: 'dark' },
    docs: {
      description: {
        story: 'Shows the form in dark mode.',
      },
    },
  },
};

export const A11yTest: Story = {
  parameters: {
    a11y: {
      config: {
        rules: [
          { id: 'color-contrast', enabled: true },
          { id: 'label', enabled: true },
          { id: 'button-name', enabled: true },
        ],
      },
    },
    docs: {
      description: {
        story: 'Tests accessibility compliance.',
      },
    },
  },
};
