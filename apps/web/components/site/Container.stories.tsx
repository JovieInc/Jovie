import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Container } from './Container';

const meta = {
  title: 'Site/Container',
  component: Container,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Compatibility container with the canonical public-content width aliases. MarketingContainer remains the canonical marketing shell owner.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Container>;

export default meta;
type Story = StoryObj<typeof meta>;

const SIZE_LABELS = {
  sm: 'sm (legacy)',
  md: 'md (legacy)',
  lg: 'lg (canonical)',
  xl: 'xl (canonical alias)',
  homepage: 'homepage (canonical alias)',
  full: 'full',
} as const;

export const Default: Story = {
  render: () => (
    <div className='bg-base py-8 text-primary-token'>
      <Container>
        <div className='rounded-lg border border-subtle bg-surface-1 p-6'>
          <h2 className='text-lg font-semibold'>Public content container</h2>
          <p className='mt-2 text-secondary-token'>
            The default maps to the canonical public-content max width.
          </p>
        </div>
      </Container>
    </div>
  ),
};

export const SizeMatrix: Story = {
  render: () => (
    <div className='space-y-4 bg-base py-8 text-primary-token'>
      {(Object.keys(SIZE_LABELS) as Array<keyof typeof SIZE_LABELS>).map(
        size => (
          <Container key={size} size={size}>
            <div className='rounded-lg border border-subtle bg-surface-1 px-4 py-3 text-sm'>
              {SIZE_LABELS[size]}
            </div>
          </Container>
        )
      )}
    </div>
  ),
};
