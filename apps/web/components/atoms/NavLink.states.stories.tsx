import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { NavLink } from './NavLink';

/** Rendered states of the navigation link, beside NavLink.stories.tsx. */
const meta = {
  title: 'Atoms/NavLink States',
  component: NavLink,
  parameters: {
    layout: 'centered',
  },
  args: {
    href: '/pricing',
    children: 'Pricing',
  },
} satisfies Meta<typeof NavLink>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: only an absolute href, so the external target is inferred. */
export const PartialInferredExternal: Story = {
  args: {
    href: 'https://support.jov.ie',
    children: 'Help center',
  },
};

/** Long content: a long primary call to action in a narrow header. */
export const LongContentPrimary: Story = {
  args: {
    href: '/signup',
    variant: 'primary',
    children: 'Start your free workspace and claim your profile',
  },
  decorators: [
    Story => (
      <div className='w-60'>
        <Story />
      </div>
    ),
  ],
};

/** Right-to-left: Arabic navigation in a right-to-left header. */
export const RtlArabicNav: Story = {
  render: args => (
    <nav dir='rtl' lang='ar' className='flex items-center gap-4'>
      <NavLink {...args} href='/pricing'>
        الأسعار
      </NavLink>
      <NavLink {...args} href='/signup' variant='primary'>
        ابدأ الآن
      </NavLink>
    </nav>
  ),
};
