import { Button, ProgressBar } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { EmptyState } from '@/components/molecules/EmptyState';
import { EmptyToFilled } from './EmptyToFilled';

const meta = {
  title: 'Molecules/EmptyToFilled',
  component: EmptyToFilled,
  parameters: {
    docs: {
      description: {
        component:
          'Empty→filled swap container. Both panes stay mounted in one grid cell (the region reserves the larger height, so the swap never shifts layout); the incoming pane runs one token-timed opacity transition; the swap is announced politely; focus inside the hidden pane moves to the new pane first actionable element. Reduced motion swaps instantly.',
      },
    },
  },
} satisfies Meta<typeof EmptyToFilled>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    state: 'empty',
    announcement: 'No releases yet',
    empty: (
      <EmptyState
        heading='No releases yet'
        description='Connect a provider to import your catalog.'
      />
    ),
    children: <p>Release list</p>,
  },
};

export const Filled: Story = {
  args: {
    state: 'filled',
    announcement: 'Releases loaded',
    empty: (
      <EmptyState
        heading='No releases yet'
        description='Connect a provider to import your catalog.'
      />
    ),
    children: (
      <div className='space-y-2'>
        <p className='text-sm text-primary-token'>Take Me Over — Cosmic Gate</p>
        <p className='text-sm text-secondary-token'>
          Published to your profile and stores.
        </p>
      </div>
    ),
  },
};

export const Transitioning: Story = {
  render: () => {
    const [state, setState] = useState<'empty' | 'filled'>('empty');
    return (
      <div className='space-y-3'>
        <Button
          size='sm'
          onClick={() => setState(state === 'empty' ? 'filled' : 'empty')}
        >
          {state === 'empty' ? 'Load releases' : 'Clear releases'}
        </Button>
        <EmptyToFilled
          state={state}
          announcement={
            state === 'filled' ? 'Releases loaded' : 'No releases yet'
          }
          empty={
            <EmptyState
              heading='No releases yet'
              description='Connect a provider to import your catalog.'
              action={{
                label: 'Connect Spotify',
                onClick: () => setState('filled'),
              }}
            />
          }
        >
          <div className='space-y-2'>
            <p className='text-sm text-primary-token'>
              Take Me Over — Cosmic Gate
            </p>
            <p className='text-sm text-secondary-token'>
              Focus the empty-state button, then load: focus follows the swap.
            </p>
          </div>
        </EmptyToFilled>
      </div>
    );
  },
};

export const ReducedMotion: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'With prefers-reduced-motion enabled, the opacity transition is disabled (motion-reduce:transition-none) and the swap is instant. The pane stack, polite announcement, and focus retention are unchanged.',
      },
    },
  },
  render: () => (
    <EmptyToFilled
      state='filled'
      announcement='Releases loaded'
      empty={
        <EmptyState
          heading='No releases yet'
          description='Connect a provider to import your catalog.'
        />
      }
    >
      <p className='text-sm text-primary-token'>Instant swap, no animation.</p>
    </EmptyToFilled>
  ),
};

export const Error: Story = {
  args: {
    state: 'empty',
    announcement: 'Import failed',
    empty: (
      <EmptyState
        variant='error'
        heading='Import failed'
        description='Spotify rejected the catalog request. Retry to continue.'
        action={{ label: 'Retry import', onClick: () => {} }}
      />
    ),
    children: <p>Release list</p>,
  },
};

export const Loading: Story = {
  args: {
    state: 'filled',
    announcement: 'Importing releases',
    empty: (
      <EmptyState
        heading='No releases yet'
        description='Connect a provider to import your catalog.'
      />
    ),
    children: (
      <div className='space-y-3 p-4'>
        <p className='text-sm text-primary-token'>Importing releases…</p>
        <ProgressBar indeterminate label='Finding music across platforms' />
      </div>
    ),
  },
};
