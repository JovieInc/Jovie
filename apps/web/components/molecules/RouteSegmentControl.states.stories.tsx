import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { RouteSegmentControl } from './RouteSegmentControl';

const meta: Meta<typeof RouteSegmentControl> = {
  title: 'UI/Molecules/RouteSegmentControl States',
  component: RouteSegmentControl,
  parameters: {
    layout: 'centered',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/app/contacts', query: {} },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: the second route is not available yet, so only one is selectable. */
export const PartialOneRouteAvailable: Story = {
  args: {
    value: 'contacts',
    options: [
      { value: 'contacts', label: 'Contacts', href: '/app/contacts' },
      {
        value: 'audience',
        label: 'Audience',
        href: '/app/contacts?tab=audience',
        disabled: true,
        ariaLabel: 'Audience (not available yet)',
      },
    ],
    'aria-label': 'Contacts Workspace',
    className: 'max-w-60',
  },
};

/** Long content: long route labels in a narrow column. */
export const LongContentLabels: Story = {
  args: {
    value: 'contacts',
    options: [
      {
        value: 'contacts',
        label: 'Contacts and collaborators',
        href: '/app/contacts',
      },
      {
        value: 'audience',
        label: 'Audience and subscribers',
        href: '/app/contacts?tab=audience',
      },
    ],
    'aria-label': 'Contacts Workspace',
  },
  render: function RenderLongContentLabels(args) {
    return (
      <div className='w-56 bg-(--app-shell-content-surface) p-2'>
        <RouteSegmentControl {...args} />
      </div>
    );
  },
};

/** Right-to-left: Arabic route labels inside an RTL document. */
export const RtlArabicRoutes: Story = {
  args: {
    value: 'contacts',
    options: [
      { value: 'contacts', label: 'جهات الاتصال', href: '/app/contacts' },
      {
        value: 'audience',
        label: 'الجمهور',
        href: '/app/contacts?tab=audience',
      },
    ],
    'aria-label': 'مساحة جهات الاتصال',
    className: 'max-w-60',
  },
  render: function RenderRtlArabicRoutes(args) {
    return (
      <div dir='rtl'>
        <RouteSegmentControl {...args} />
      </div>
    );
  },
};
