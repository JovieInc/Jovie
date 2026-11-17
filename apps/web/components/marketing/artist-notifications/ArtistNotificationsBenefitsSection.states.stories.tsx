import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_NOTIFICATIONS_COPY } from '@/data/artistNotificationsCopy';
import { ArtistNotificationsBenefitsSection } from './ArtistNotificationsBenefitsSection';

/** Rendered states of the benefits grid; the default lives in ArtistNotificationsBenefitsSection.stories.tsx. */
const meta = {
  title:
    'Marketing/Artist Notifications/ArtistNotificationsBenefitsSection States',
  component: ArtistNotificationsBenefitsSection,
  parameters: { layout: 'fullscreen' },
  args: { benefits: ARTIST_NOTIFICATIONS_COPY.benefits },
} satisfies Meta<typeof ArtistNotificationsBenefitsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: the section header with no benefit cards. */
export const EmptyBenefits: Story = {
  args: { benefits: { ...ARTIST_NOTIFICATIONS_COPY.benefits, items: [] } },
};

/** Long content: long benefit titles and bodies that wrap in the grid. */
export const LongContentBenefits: Story = {
  args: {
    benefits: {
      headline: 'Every listener hears about every release, automatically.',
      body: 'Notifications go out for new music, nearby shows and every moment worth a return visit, without a campaign to write or a list to export.',
      items: [1, 2, 3].map(index => ({
        title: `A deliberately long benefit title number ${index} that wraps`,
        body: 'A benefit body long enough to wrap across several lines in a narrow column, so the grid keeps every card readable at every width.',
      })),
    },
  },
};

/** Right-to-left: Arabic benefit copy in an Arabic document direction. */
export const RtlArabic: Story = {
  args: {
    benefits: {
      headline: 'تصل إلى المستمعين تلقائيًا.',
      body: 'إشعارات للموسيقى الجديدة والحفلات القريبة.',
      items: [
        { title: 'موسيقى جديدة', body: 'يعرف المستمعون فور صدورها.' },
        { title: 'حفلات قريبة', body: 'تنبيه عند اقتراب حفل.' },
      ],
    },
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
