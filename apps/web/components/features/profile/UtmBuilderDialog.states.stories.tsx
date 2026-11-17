import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { UtmBuilderDialog } from './UtmBuilderDialog';

/**
 * Rendered states of the UTM builder, shown in its embedded page form so the
 * fields render inline. The dialog story lives in UtmBuilderDialog.stories.tsx.
 */
const PanelFrame: Decorator = function PanelFrame(Story) {
  return (
    <div className='w-full max-w-md bg-base p-6'>
      <Story />
    </div>
  );
};

const RtlFrame: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

const meta = {
  title: 'Features/Profile/UtmBuilderDialog/States',
  component: UtmBuilderDialog,
  parameters: { layout: 'centered' },
  args: {
    open: true,
    embedded: true,
    baseUrl: 'https://jov.ie/artisthandle',
  },
  decorators: [PanelFrame],
} satisfies Meta<typeof UtmBuilderDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no fields filled, so the link is the bare profile URL. */
export const EmptyFields: Story = {};

/**
 * Error: a medium without the required source keeps Copy and Open disabled
 * and shows the inline rule.
 */
export const ErrorMissingSource: Story = {
  args: { initialValues: { utm_medium: 'social', utm_campaign: 'spring' } },
};

/** Partial: only the required source is filled. */
export const PartialSourceOnly: Story = {
  args: { initialValues: { utm_source: 'instagram' } },
};

/** Long content: long values wrap the built link instead of overflowing. */
export const LongContentValues: Story = {
  args: {
    initialValues: {
      utm_source: 'instagram_stories_and_reels_paid_partnership',
      utm_medium: 'social_paid_partnership_creator_collaboration',
      utm_campaign: 'summer_world_tour_2026_north_america_and_europe_leg',
      utm_term: 'progressive_house_melodic_techno_fans',
      utm_content: 'carousel_variant_b_with_tour_dates_and_ticket_links',
    },
  },
};

/** Right-to-left: Arabic values in an Arabic document direction. */
export const RtlArabicValues: Story = {
  args: {
    initialValues: { utm_source: 'انستغرام', utm_campaign: 'جولة_الصيف' },
  },
  decorators: [RtlFrame],
};
