import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LOGO_PERMISSION_FIXTURES } from '@/data/product-truth/logo-permissions.fixture';
import { HomeTrustSection } from './HomeTrustSection';

const meta = {
  title: 'Marketing/Sections/HomeTrustSection/States',
  component: HomeTrustSection,
  parameters: { layout: 'fullscreen', backgrounds: { default: 'dark' } },
  args: {
    placement: { page: '/' },
    fixturePermissions: LOGO_PERMISSION_FIXTURES,
    label: 'Trusted by independent artists and labels',
  },
} satisfies Meta<typeof HomeTrustSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: the logo filter matches nothing, so the section renders nothing. */
export const EmptyNoMatchingLogos: Story = {
  args: { logoIds: [] },
};

/** Partial: only two of the permitted logos are requested. */
export const PartialTwoLogos: Story = {
  args: { logoIds: ['awal', 'umg'] },
};

/** Long content: a long label wraps above the logos. */
export const LongContentLabel: Story = {
  args: {
    label:
      'Trusted by independent artists, managers, distributors and labels who release music every single week across every platform',
    variant: 'compact',
  },
};

/** Permission denied: no grant covers the placement, so nothing renders. */
export const PermissionDeniedNoGrant: Story = {
  args: { fixturePermissions: [] },
};

/** Right to left: the card under an Arabic document direction. */
export const RtlOverflow: Story = {
  args: { label: 'يثق بنا الفنانون المستقلون والعلامات الموسيقية' },
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
