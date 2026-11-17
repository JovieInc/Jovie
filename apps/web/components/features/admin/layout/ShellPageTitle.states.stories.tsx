import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  HeaderActionsProvider,
  useHeaderActions,
} from '@/contexts/HeaderActionsContext';
import { ShellPageTitle } from './ShellPageTitle';

function HeaderBadgePreview() {
  const { headerBadge } = useHeaderActions();
  return (
    <div className='truncate rounded-md border border-subtle px-3 py-2 text-sm text-secondary-token'>
      Shell breadcrumb: {headerBadge ?? '(none)'}
    </div>
  );
}

function TitleFrame({
  title,
  dir = 'ltr',
}: {
  readonly title: string;
  readonly dir?: 'ltr' | 'rtl';
}) {
  return (
    <HeaderActionsProvider>
      <div dir={dir} className='w-72 space-y-3'>
        <HeaderBadgePreview />
        <ShellPageTitle title={title} />
      </div>
    </HeaderActionsProvider>
  );
}

function renderTitle(args: { readonly title: string }) {
  return <TitleFrame title={args.title} />;
}

const meta = {
  title: 'Features/Admin/ShellPageTitle States',
  component: ShellPageTitle,
  parameters: { layout: 'centered' },
  render: renderTitle,
} satisfies Meta<typeof ShellPageTitle>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: a title longer than the breadcrumb slot that shows it. */
export const LongContentTitle: Story = {
  args: {
    title:
      'Golden path certifications for every public profile, release page and checkout flow in production',
  },
};

function renderRtl(args: { readonly title: string }) {
  return <TitleFrame title={args.title} dir='rtl' />;
}

/** RTL: an Arabic title handed to a right-to-left shell. */
export const RtlArabicTitle: Story = {
  args: { title: 'شهادات المسار الذهبي' },
  render: renderRtl,
};
