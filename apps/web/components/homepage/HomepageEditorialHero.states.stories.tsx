import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomepageEditorialHero } from './HomepageEditorialHero';

const meta = {
  title: 'Marketing/HomepageEditorialHero States',
  component: HomepageEditorialHero,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof HomepageEditorialHero>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: a headline and support line well past their usual length. */
export const LongContentHeadline: Story = {
  args: {
    headingId: 'homepage-editorial-hero-long-heading',
    headline:
      'Control how the world sees you, from your first release to every page, link and fan who finds you after it.',
    support:
      'Find what the internet already knows about your music, correct it in one place, and turn every visit into a relationship you keep.',
    search: {
      placeholder: 'Search your artist name or paste a Spotify link',
      action: 'Find my profile',
    },
  },
};

/** Right-to-left: Arabic hero copy in an Arabic document direction. */
export const RtlArabic: Story = {
  args: {
    headingId: 'homepage-editorial-hero-rtl-heading',
    headline: 'تحكم في الطريقة التي يراك بها العالم.',
    support: 'اعرف ما يعرفه الإنترنت عنك، وحوّله إلى علاقات.',
    search: { placeholder: 'ابحث عن اسمك', action: 'ابحث' },
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
