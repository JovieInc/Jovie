import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { NumberedSection } from './NumberedSection';

/** Rendered states of the numbered section; defaults live in NumberedSection.stories.tsx. */
const meta = {
  title: 'Marketing/Sections/NumberedSection States',
  component: NumberedSection,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      // Render the settled section; scroll timelines need a full page to advance.
      <div data-numbered-section-story>
        <style>{`
          [data-numbered-section-story] .reveal-on-scroll {
            animation: none;
            opacity: 1;
            transform: none;
          }
        `}</style>
        <Story />
      </div>
    ),
  ],
  args: {
    sectionNumber: '1.0',
    sectionTitle: 'Intake',
    heading: 'Start with the release.',
    description:
      'Capture the artist, asset, and release context before choosing the route.',
    children: (
      <div className='rounded-xl border border-subtle bg-surface-0 p-6 text-primary-token'>
        Release plan preview
      </div>
    ),
  },
} satisfies Meta<typeof NumberedSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: an empty sub-item list renders no accordion row. */
export const EmptySubItems: Story = {
  args: { subItems: [] },
};

/** Partial: one sub-item and no anchor id. */
export const PartialSingleSubItem: Story = {
  args: {
    subItems: [
      {
        number: '1.1',
        title: 'Profile',
        description: 'Confirm the public profile surface.',
      },
    ],
  },
};

/** Long content: a heading past the two-line clamp and long sub-items. */
export const LongContentClampedHeading: Story = {
  args: {
    id: 'numbered-long',
    sectionTitle: 'Intake, routing and every release detail',
    heading:
      'Start with the release, then every asset, pitch and fan moment that follows it',
    description:
      'Capture the artist, every asset, the release context, the pitch plan and the fan moments before choosing the route, so nothing has to be entered twice.',
    subItems: [
      {
        number: '1.1',
        title: 'Profile, links and every listening service',
        description:
          'Confirm the public profile surface, the smart links and every listening service before the release goes live.',
      },
      {
        number: '1.2',
        title: 'Campaign and conversion moment',
        description:
          'Choose the conversion moment and the follow-up that turns a listen into a lasting fan relationship.',
      },
    ],
  },
};

/** Right-to-left: Arabic section copy in an Arabic document direction. */
export const RtlArabic: Story = {
  args: {
    sectionTitle: 'الاستقبال',
    heading: 'ابدأ بالإصدار.',
    description: 'التقط سياق الفنان والإصدار قبل اختيار المسار.',
    subItems: [
      { number: '1.1', title: 'الملف', description: 'أكد واجهة الملف العامة.' },
    ],
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
