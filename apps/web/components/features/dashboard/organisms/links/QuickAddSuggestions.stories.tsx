import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { SUGGESTION_PILLS } from './config';
import { QuickAddSuggestions } from './QuickAddSuggestions';

const withNarrowFrame: Decorator = Story => (
  <div className='w-80 rounded-lg border border-subtle bg-surface-0 p-2'>
    <Story />
  </div>
);

const withRtlFrame: Decorator = Story => (
  <div
    dir='rtl'
    className='w-80 rounded-lg border border-subtle bg-surface-0 p-2'
  >
    <Story />
  </div>
);

const meta = {
  title: 'Dashboard/Organisms/Links/QuickAddSuggestions States',
  component: QuickAddSuggestions,
  parameters: { layout: 'centered' },
  args: {
    existingPlatforms: new Set<string>(),
    onPlatformSelect: fn(),
  },
} satisfies Meta<typeof QuickAddSuggestions>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: every suggested platform is already added, so the row unmounts. */
export const EmptyAllPlatformsAdded: Story = {
  args: {
    existingPlatforms: new Set(SUGGESTION_PILLS.map(pill => pill.id)),
  },
  decorators: [withNarrowFrame],
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByTestId('quick-add-suggestions')
    ).toBeNull();
  },
};

/** Partial: some platforms are added and the profile type is left unset. */
export const PartialSomePlatformsAdded: Story = {
  args: {
    existingPlatforms: new Set(['instagram', 'tiktok', 'youtube', 'venmo']),
  },
  decorators: [withNarrowFrame],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByText('Instagram')).toBeNull();
    await expect(canvas.queryByText('YouTube Music')).toBeNull();
    await expect(canvas.getByText('Apple Music')).toBeInTheDocument();
  },
};

/** Long content: every suggestion in a narrow column scrolls sideways. */
export const LongContentAllSuggestions: Story = {
  args: { isMusicProfile: true },
  decorators: [withNarrowFrame],
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole('button')).toHaveLength(
      SUGGESTION_PILLS.length
    );
    await userEvent.click(
      canvas.getByRole('button', { name: /Select Apple Music/ })
    );
    await expect(args.onPlatformSelect).toHaveBeenCalledWith(
      'https://music.apple.com/artist/'
    );
  },
};

/** Right-to-left: the scroll row and its fades inside an RTL document. */
export const RtlSuggestions: Story = {
  args: { isMusicProfile: true },
  decorators: [withRtlFrame],
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('region', {
        name: 'Quick link suggestions',
      })
    ).toBeVisible();
  },
};
