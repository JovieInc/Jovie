import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingContentShell } from './MarketingContentShell';
import { MarketingPageShell } from './MarketingPageShell';

const meta = {
  title: 'Marketing/Primitives/MarketingContentShell States',
  component: MarketingContentShell,
  parameters: { layout: 'fullscreen' },
  args: { children: null },
  decorators: [
    Story => (
      <MarketingPageShell className='bg-base text-primary-token'>
        <Story />
      </MarketingPageShell>
    ),
  ],
} satisfies Meta<typeof MarketingContentShell>;

export default meta;
type Story = StoryObj<typeof meta>;

const paragraphs = [
  'Long-form marketing pages use this prose-width shell so about, support and legal-style bodies share typography and vertical rhythm without a second page chrome.',
  'Each paragraph keeps a readable measure however much copy the page carries, from a short about page to a full set of terms with numbered sections and definitions.',
  'Artists, managers and labels read the same terms. Visitors to a public profile read the parts that apply to them, and nothing here changes what a profile shows.',
  'When the terms change, the page says what changed and when, and the earlier version stays linked from the bottom of the page for anyone who needs it.',
];

/** Long content: a legal-length body with many paragraphs and a long word. */
export const LongContentLegalBody: Story = {
  render: () => (
    <MarketingContentShell>
      <h1 className='text-3xl font-semibold text-primary-token'>
        Terms of Service for artists, managers, labels and everyone who visits a
        Jovie profile
      </h1>
      {paragraphs.map(text => (
        <p className='mt-4' key={text}>
          {text}
        </p>
      ))}
      <p className='mt-4 break-words'>
        Supercalifragilisticexpialidociousartistprofileworkspace
      </p>
    </MarketingContentShell>
  ),
};

/** Right-to-left: an Arabic page body in an Arabic document direction. */
export const RtlArabic: Story = {
  render: () => (
    <div dir='rtl' lang='ar'>
      <MarketingContentShell>
        <h1 className='text-3xl font-semibold text-primary-token'>عن جوفي</h1>
        <p className='mt-4'>جوفي منتج واحد للحضور والعلاقات والنمو.</p>
      </MarketingContentShell>
    </div>
  ),
};
