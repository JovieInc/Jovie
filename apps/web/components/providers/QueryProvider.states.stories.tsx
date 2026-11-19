import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useQuery } from '@tanstack/react-query';
import { QueryProvider } from './QueryProvider';

const LONG_COPY =
  'This deliberately long page copy runs across several lines so the provider can be checked for passing long children through unchanged, without clipping, truncating or reflowing anything it wraps, at every width the app supports.';

/** A child whose query fails once, with retries off, through the app client. */
function FailingReleasesQuery() {
  const query = useQuery({
    queryKey: ['storybook', 'query-provider-states', 'failing'],
    staleTime: 0,
    queryFn: async ({ signal }): Promise<string[]> => {
      signal.throwIfAborted();
      throw new Error('Releases are unavailable right now.');
    },
    retry: false,
  });

  if (query.isError) {
    return (
      <p
        role='alert'
        className='rounded-lg border border-subtle bg-surface-0 p-4 text-sm text-primary-token'
      >
        {query.error.message}
      </p>
    );
  }
  return <p className='text-sm text-secondary-token'>Loading releases</p>;
}

const meta = {
  title: 'Providers/QueryProvider States',
  component: QueryProvider,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof QueryProvider>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Error: a failed query reaches the child that owns it. */
export const ErrorFailedQuery: Story = {
  args: {
    children: <FailingReleasesQuery />,
  },
};

/** Long content: long children pass through the provider unchanged. */
export const LongContentChildren: Story = {
  args: {
    children: (
      <p className='w-full max-w-md rounded-lg border border-subtle bg-surface-0 p-4 text-sm text-primary-token'>
        {LONG_COPY}
      </p>
    ),
  },
};

/** RTL: right-to-left children keep their direction inside the provider. */
export const RtlChildren: Story = {
  args: {
    children: (
      <p
        dir='rtl'
        lang='ar'
        className='rounded-lg border border-subtle bg-surface-0 p-4 text-sm text-primary-token'
      >
        محتوى الصفحة داخل مزود في مستند من اليمين إلى اليسار.
      </p>
    ),
  },
};
