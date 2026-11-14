import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingContainer } from './MarketingContainer';

const meta = {
  title: 'Marketing/Primitives/MarketingContainer',
  component: MarketingContainer,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className='bg-base py-16 text-primary-token'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MarketingContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

function ContainerDemo({
  title,
  body,
}: Readonly<{ title: string; body: string }>) {
  return (
    <div className='rounded-2xl border border-subtle bg-surface-1 p-8'>
      <h2 className='text-xl font-semibold text-primary-token'>{title}</h2>
      <p className='mt-3 text-sm leading-relaxed text-secondary-token'>
        {body}
      </p>
    </div>
  );
}

export const Page: Story = {
  args: { width: 'page', children: null },
  render: args => (
    <MarketingContainer width={args.width}>
      <ContainerDemo
        title='Canonical page width'
        body='Public marketing routes share this max-w-public-content column so sections line up from homepage through pricing and feature pages.'
      />
    </MarketingContainer>
  ),
};

export const Landing: Story = {
  args: { width: 'landing', children: null },
  render: args => (
    <MarketingContainer width={args.width}>
      <ContainerDemo
        title='Landing width alias'
        body='Landing stays as a call-site alias of the same public-content token until the remaining Wave 4 width sweep lands.'
      />
    </MarketingContainer>
  ),
};

export const Prose: Story = {
  args: { width: 'prose', children: null },
  render: args => (
    <MarketingContainer width={args.width}>
      <ContainerDemo
        title='Canonical prose width'
        body='Long-form about, support, and legal-style reading uses the 680px prose token instead of the public page column.'
      />
    </MarketingContainer>
  ),
};

/**
 * Long content: an unbroken run and a long paragraph inside the prose
 * measure. The column keeps its width; the content has to wrap or break.
 */
export const LongContentProse: Story = {
  args: { width: 'prose', children: null },
  render: args => (
    <MarketingContainer width={args.width}>
      <ContainerDemo
        title='Smart links, release pages, pre-saves and fan capture for independent artists, DJs and labels everywhere'
        body='Jovie turns every release into a page that captures fans before, during and after launch day. https://jov.ie/release/midnight-drive-extended-club-mix-feat-maya-vale-deluxe-anniversary-edition-2026 keeps working on any platform your fans already use, without a second link-in-bio or a separate pre-save tool to maintain.'
      />
    </MarketingContainer>
  ),
};

/** Right-to-left: Arabic heading and body inside the page column. */
export const RtlPage: Story = {
  args: { width: 'page', children: null },
  render: args => (
    <div dir='rtl' lang='ar'>
      <MarketingContainer width={args.width}>
        <ContainerDemo
          title='عرض الصفحة القياسي'
          body='تشترك صفحات التسويق العامة في هذا العمود حتى تصطف الأقسام من الصفحة الرئيسية إلى صفحات الأسعار والميزات.'
        />
      </MarketingContainer>
    </div>
  ),
};
