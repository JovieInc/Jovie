import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingContentProse } from './MarketingContentProse';

const meta = {
  title: 'Marketing/Components/MarketingContentProse States',
  component: MarketingContentProse,
  parameters: { layout: 'fullscreen' },
  args: { html: '<p>Ship something every Friday.</p>' },
  render: args => (
    <main className='bg-base p-8 text-primary-token'>
      <MarketingContentProse {...args} />
    </main>
  ),
} satisfies Meta<typeof MarketingContentProse>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: one paragraph, no headings or links, default label. */
export const PartialSingleParagraph: Story = {};

/** Long content: several sections, a list, a quote and a long word. */
export const LongContentArticle: Story = {
  args: {
    ariaLabel: 'Founder letter',
    html: [
      '<h2 id="why">Why we built Jovie</h2>',
      '<p>Every release used to mean a dozen tools, a dozen logins and a spreadsheet nobody trusted. We wanted one calm place where the plan, the page and the people who care about the music stay in step without anyone copying links by hand at midnight before release day.</p>',
      '<blockquote><p>The best release plan is the one that keeps itself current.</p></blockquote>',
      '<h2 id="what">What it does</h2>',
      '<ul><li>Plans every date and asset a release needs.</li><li>Keeps your profile leading with the newest record.</li><li>Lets fans ask to hear about the next one.</li></ul>',
      '<p>Supercalifragilisticexpialidociousreleaseplanningworkspace stays inside the column.</p>',
    ].join(''),
  },
};

/** Right-to-left: an Arabic article in an Arabic document direction. */
export const RtlArabic: Story = {
  args: {
    ariaLabel: 'محتوى المقال',
    html: '<h2 id="rhythm">إيقاع الإصدار</h2><p>أصدر شيئًا كل جمعة، واحتفظ بالسياق في مكان واحد.</p>',
  },
  render: args => (
    <main dir='rtl' lang='ar' className='bg-base p-8 text-primary-token'>
      <MarketingContentProse {...args} />
    </main>
  ),
};
