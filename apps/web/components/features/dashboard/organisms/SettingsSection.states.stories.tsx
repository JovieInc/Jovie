import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { SettingsPanel } from '@/components/molecules/settings/SettingsPanel';
import { SettingsSection } from './SettingsSection';

const LONG_TITLE =
  'Audience verification, double opt-in confirmation and fan tracking preferences';
const LONG_DESCRIPTION =
  'Control how new fans confirm their email, which tracking pixels fire on your public profile, and how long Jovie keeps anonymous visit data before it is aggregated.';

/** State coverage for the settings page section shell. */
const meta = {
  title: 'Dashboard/Organisms/SettingsSection States',
  component: SettingsSection,
  parameters: { layout: 'fullscreen' },
  args: {
    id: 'audience-tracking',
    title: 'Audience & tracking',
    description: 'Fan verification, opt-ins, and tracking.',
    children: (
      <SettingsPanel
        title='Audience verification'
        description='Control whether new fans must confirm their email.'
        bodyClassName='px-4 py-4 sm:px-5'
      >
        <p className='text-app text-secondary-token'>Settings content</p>
      </SettingsPanel>
    ),
  },
} satisfies Meta<typeof SettingsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: the section still labels its region when there are no settings. */
export const Empty: Story = {
  args: { children: null, description: undefined },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('region', { name: 'Audience & tracking' })
    ).toBeVisible();
  },
};

/** Partial: a section with a title but no description or header action. */
export const PartialNoDescription: Story = {
  args: { description: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { name: 'Audience & tracking' })
    ).toBeVisible();
  },
};

/** Long content: a long title and description in a narrow column. */
export const LongContentHeader: Story = {
  args: { title: LONG_TITLE, description: LONG_DESCRIPTION },
  decorators: [
    function LongContentHeaderDecorator(Story) {
      return (
        <div className='max-w-sm'>
          <Story />
        </div>
      );
    },
  ],
};

/** Right-to-left: the section header and body inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    title: 'الجمهور والتتبع',
    description: 'التحقق من المعجبين والاشتراك والتتبع.',
  },
  decorators: [
    function RtlDocumentDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
