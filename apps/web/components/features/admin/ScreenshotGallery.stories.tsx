import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ScreenshotGallery } from './ScreenshotGallery';
import {
  screenshotFixture,
  screenshotFixtureSet,
} from './screenshot-gallery-fixtures';

const meta = {
  title: 'Features/Admin/ScreenshotGallery',
  component: ScreenshotGallery,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className='w-full max-w-5xl bg-base p-4 text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: { screenshots: screenshotFixtureSet() },
} satisfies Meta<typeof ScreenshotGallery>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const EmptyNoCaptures: Story = { args: { screenshots: [] } };

export const LongContentTitles: Story = {
  args: {
    screenshots: [
      screenshotFixture({
        title:
          'Homepage Desktop With An Unusually Long Capture Title That Must Truncate Inside The Card Without Shifting The Grid',
        canonicalSurfaceLabel:
          'Homepage And Every Supporting Marketing Surface Review',
      }),
    ],
  },
};

export const RtlTitles: Story = {
  args: {
    screenshots: [
      screenshotFixture({
        title: 'الصفحة الرئيسية على سطح المكتب',
        groupLabel: 'التسويق',
        canonicalSurfaceLabel: 'الصفحة الرئيسية',
      }),
    ],
  },
};
