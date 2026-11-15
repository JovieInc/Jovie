import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, within } from 'storybook/test';
import { EntityHeader } from '@/components/molecules/drawer';
import { InspectorShell } from './InspectorRail';
import { LIBRARY_INSPECTOR_TABS } from './inspector-tabs';

const railFrame: Decorator = function RailFrame(Story) {
  return (
    <div className='flex h-screen min-h-0 justify-end'>
      <Story />
    </div>
  );
};

const rtl: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl' lang='ar' className='flex h-screen min-h-0 justify-end'>
      <Story />
    </div>
  );
};

const FACTS = Array.from(
  { length: 60 },
  (_, index) =>
    `Fact ${index + 1}: credited contributor, territory and rights holder details that wrap across lines`
);

/** State coverage for the inspector shell; Default, Loading, Empty and Error live in InspectorRail.stories.tsx. */
const meta = {
  title: 'Molecules/Inspector/InspectorShell States',
  component: InspectorShell,
  decorators: [railFrame],
  args: {
    isOpen: true,
    ariaLabel: 'Release inspector',
    tabs: LIBRARY_INSPECTOR_TABS,
    activeTab: 'details' as const,
    onTabChange: fn(),
    tabsAriaLabel: 'Inspector tabs',
    objectHeader: <EntityHeader className='px-3 pt-3' title='Take Me Over' />,
    children: <p>Details body</p>,
    isLoading: false,
  },
} satisfies Meta<typeof InspectorShell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: no object header and no close or context actions, only tabs and body. */
export const PartialNoHeader: Story = {
  args: { objectHeader: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('tabpanel')).toHaveTextContent(
      'Details body'
    );
    await expect(canvas.queryByText('Take Me Over')).not.toBeInTheDocument();
  },
};

/** Long content: a wrapping object title over sixty facts that scroll inside the panel. */
export const LongContentScrollingFacts: Story = {
  args: {
    objectHeader: (
      <EntityHeader
        className='px-3 pt-3'
        title='A deliberately long release title with enough words to wrap across the inspector header'
        titleLineClamp={1}
      />
    ),
    children: (
      <>
        {FACTS.map(fact => (
          <p key={fact} className='py-2'>
            {fact}
          </p>
        ))}
      </>
    ),
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('tabpanel')).toHaveAttribute(
      'data-scroll-mode',
      'internal'
    );
  },
};

/** Right-to-left: an Arabic object and body in an RTL inspector. */
export const RtlArabic: Story = {
  args: {
    ariaLabel: 'مفتش الإصدار',
    objectHeader: <EntityHeader className='px-3 pt-3' title='خذني بعيدًا' />,
    children: <p>تفاصيل الإصدار</p>,
  },
  decorators: [rtl],
};
