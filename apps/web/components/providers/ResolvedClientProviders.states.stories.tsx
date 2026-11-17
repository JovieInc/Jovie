import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, use } from 'react';
import { ResolvedClientProviders as ResolvedClientProvidersAsync } from './ResolvedClientProviders';

// ResolvedClientProviders is an async server component. Each story's promise
// is created once, outside render, keyed by the story's own variant name, so
// a suspended first mount never starts a second resolve.
const resolved = new Map<string, Promise<ReactNode>>();

function ResolvedClientProviders({
  variant,
  children,
}: {
  readonly variant: string;
  readonly children: ReactNode;
}) {
  let tree = resolved.get(variant);
  if (!tree) {
    tree = ResolvedClientProvidersAsync({ children });
    resolved.set(variant, tree);
  }
  return use(tree);
}

const meta = {
  title: 'Providers/ResolvedClientProviders States',
  component: ResolvedClientProviders,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof ResolvedClientProviders>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: long children pass through the resolved tree unchanged. */
export const LongContentChildren: Story = {
  args: {
    variant: 'long-content',
    children: (
      <p className='w-full max-w-md p-4 text-sm text-primary-token'>
        This deliberately long page copy runs across several lines so the
        provider tree can be checked for passing long children through
        unchanged, without clipping, truncating or reflowing anything it wraps,
        at every width the app supports.
      </p>
    ),
  },
};

/** RTL: right-to-left children keep their direction inside the tree. */
export const RtlChildren: Story = {
  args: {
    variant: 'rtl',
    children: (
      <p dir='rtl' lang='ar' className='p-4 text-sm text-primary-token'>
        محتوى الصفحة داخل مزود في مستند من اليمين إلى اليسار.
      </p>
    ),
  },
};
