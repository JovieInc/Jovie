import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  COUNTRY_OPTIONS,
  type CountryOption,
  CountrySelector,
} from './CountrySelector';

const [unitedStates, canada] = COUNTRY_OPTIONS as [
  CountryOption,
  CountryOption,
];

const longLabelCountry: CountryOption = {
  ...unitedStates,
  label:
    'United States of America — Continental and Overseas Territories Notification Pref',
};

const rtlLabelCountry: CountryOption = {
  ...canada,
  label: 'كندا — رمز الاتصال للإشعارات',
};

const meta = {
  title: 'Features/Profile/CountrySelector',
  component: CountrySelector,
  parameters: {
    layout: 'centered',
  },
  args: {
    country: unitedStates,
    onOpenChange: () => {},
    onSelect: () => {},
  },
} satisfies Meta<typeof CountrySelector>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {
  args: {
    isOpen: false,
  },
};

export const Open: Story = {
  args: {
    isOpen: true,
  },
};

export const EmptyNoSelectionOpen: Story = {
  args: {
    isOpen: true,
    country: unitedStates,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Open menu with the full US/CAN option list (empty search/filter path is N/A; list always has two rows).',
      },
    },
  },
};

export const LongContentCountryLabel: Story = {
  args: {
    isOpen: true,
    country: longLabelCountry,
  },
  decorators: [
    Story => (
      <div className='w-56'>
        <Story />
      </div>
    ),
  ],
};

export const RtlOverflowCountryLabel: Story = {
  args: {
    isOpen: true,
    country: rtlLabelCountry,
  },
  decorators: [
    Story => (
      <div dir='rtl' className='w-56'>
        <Story />
      </div>
    ),
  ],
};
