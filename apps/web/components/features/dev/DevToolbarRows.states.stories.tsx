import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FlagRow, OrphanOverrides } from './DevToolbarRows';

/**
 * Rendered states of the dev toolbar rows. The plain flag rows live in
 * DevToolbarRows.stories.tsx.
 */
const meta = {
  title: 'Features/Dev/DevToolbarRows/States',
  component: FlagRow,
  parameters: { layout: 'padded' },
  args: {
    label: 'claim handle',
    isOverridden: false,
    checked: false,
    source: 'code',
    onCheckedChange: () => undefined,
    onClear: () => undefined,
  },
} satisfies Meta<typeof FlagRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: the orphan override list with nothing left to purge. */
export const EmptyOrphans: Story = {
  render: function EmptyOrphansRender() {
    return <OrphanOverrides keys={[]} onPurge={() => undefined} />;
  },
};

/** Partial: an overridden flag whose server default is unknown. */
export const PartialNoServerDefault: Story = {
  args: { label: 'Spotify OAuth', isOverridden: true, checked: true },
};

/** Long content: a long flag label that truncates beside its source. */
export const LongContentLabel: Story = {
  args: {
    label:
      'release plan generator with playlist pitching, fan SMS and every provider verification step',
    source: 'statsig',
  },
  decorators: [
    function NarrowRow(StoryComponent) {
      return (
        <div className='w-64'>
          <StoryComponent />
        </div>
      );
    },
  ],
};

/** Long content: many orphaned override keys. */
export const ManyOrphans: Story = {
  render: function ManyOrphansRender() {
    return (
      <OrphanOverrides
        keys={Array.from(
          { length: 8 },
          (_, index) => `jovie:flag-override:retired-experiment-${index + 1}`
        )}
        onPurge={() => undefined}
      />
    );
  },
};

/** Right-to-left: an Arabic flag label in an Arabic document direction. */
export const RtlArabicLabel: Story = {
  args: {
    label: 'تسجيل الدخول عبر سبوتيفاي',
    isOverridden: true,
    checked: true,
    serverDefault: false,
  },
  decorators: [
    function RtlDirection(StoryComponent) {
      return (
        <div dir='rtl' lang='ar'>
          <StoryComponent />
        </div>
      );
    },
  ],
};
