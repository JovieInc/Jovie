import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { DrawerEntityAvatar } from './DrawerEntityAvatar';
import { EntityHeader } from './EntityHeader';
import { EntityTabbedRail } from './EntityTabbedRail';

const tabOptions = [
  { value: 'details', label: 'Details' },
  { value: 'activity', label: 'Activity' },
  { value: 'sources', label: 'Sources' },
] as const;

const RtlFrame: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
};

const meta = {
  title: 'Molecules/Drawer/EntityTabbedRail States',
  component: EntityTabbedRail,
  parameters: { layout: 'fullscreen' },
  args: {
    isOpen: true,
    ariaLabel: 'Visitor details',
    activeTab: 'details',
    onTabChange: fn(),
    tabOptions,
    tabsAriaLabel: 'Visitor tabs',
    title: 'Visitor',
    entityHeader: (
      <EntityHeader
        layout='grid'
        thumbnail={<DrawerEntityAvatar name='Visitor' />}
        title='Visitor'
        subtitle='Berlin · 18 visits'
      />
    ),
    children: <p className='text-sm text-secondary-token'>Visitor details</p>,
  },
} satisfies Meta<typeof EntityTabbedRail>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: the header carries the rail and the tabbed card is hidden. */
export const PartialHeaderOnly: Story = {
  args: {
    hideTabbedCard: true,
  },
};

/** Long content: a long header and a long details body. */
export const LongContentDetails: Story = {
  args: {
    entityHeader: (
      <EntityHeader
        layout='grid'
        thumbnail={
          <DrawerEntityAvatar name='Alexandria Catalina Rivera-Montgomery' />
        }
        title='Alexandria Catalina Rivera-Montgomery de la Cruz'
        subtitle='Berlin, Germany · 18 visits across 4 releases and 2 tour dates'
      />
    ),
    children: (
      <p className='text-sm text-secondary-token'>
        Returning listener who saved two or more releases in the last 90 days,
        opened every release-day email, tapped through to three streaming
        services and bought a ticket for the Berlin tour date after the pre-save
        campaign.
      </p>
    ),
  },
};

/** Right-to-left: Arabic header, tabs and body inside an RTL document. */
export const RtlArabicRail: Story = {
  args: {
    ariaLabel: 'تفاصيل الزائر',
    tabsAriaLabel: 'علامات تبويب الزائر',
    title: 'زائر',
    tabOptions: [
      { value: 'details', label: 'التفاصيل' },
      { value: 'activity', label: 'النشاط' },
      { value: 'sources', label: 'المصادر' },
    ],
    entityHeader: (
      <EntityHeader
        layout='grid'
        thumbnail={<DrawerEntityAvatar name='عمرو دياب' />}
        title='عمرو دياب'
        subtitle='القاهرة · ١٨ زيارة'
      />
    ),
    children: <p className='text-sm text-secondary-token'>تفاصيل الزائر</p>,
  },
  decorators: [RtlFrame],
};
