import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { CTASection } from './CTASection';

/**
 * State coverage for the closing call-to-action band. These render the same
 * section as CTASection.stories.tsx and change only the caller copy or the
 * document direction.
 */
const meta = {
  title: 'Organisms/CTASection States',
  component: CTASection,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    title: 'Ready to grow your fanbase?',
    buttonText: 'Get started',
    buttonHref: '/start',
    description:
      'Set up your Jovie page in minutes, free forever on the base plan.',
  },
} satisfies Meta<typeof CTASection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: title and action only, with no supporting description. */
export const PartialTitleOnly: Story = {
  args: {
    description: undefined,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { name: 'Ready to grow your fanbase?' })
    ).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Get started' })).toBeVisible();
  },
};

const LONG_TITLE =
  'Ready to turn every stream, show and share into a fan you can reach again?';
const LONG_DESCRIPTION =
  'Set up your Jovie page in minutes, connect your releases and socials, and start capturing fans from every link you share. The base plan stays free forever, and you can upgrade whenever you want more.';

/** Long content: long title, description and button label wrap cleanly. */
export const LongContentCopy: Story = {
  args: {
    title: LONG_TITLE,
    description: LONG_DESCRIPTION,
    buttonText: 'Create your free artist page',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(LONG_DESCRIPTION)).toBeVisible();
  },
};

/** Right-to-left: Arabic copy in the secondary band inside an RTL document. */
export const RtlArabicSecondary: Story = {
  args: {
    variant: 'secondary',
    title: 'هل أنت مستعد لتنمية جمهورك؟',
    description: 'أنشئ صفحتك على جوفي في دقائق، مجانًا دائمًا.',
    buttonText: 'ابدأ الآن',
  },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: 'ابدأ الآن' })).toBeVisible();
  },
};
