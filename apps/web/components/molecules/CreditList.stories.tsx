import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CreditList } from './CreditList';

const meta = {
  title: 'Molecules/CreditList',
  component: CreditList,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof CreditList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    names: ['Vigel', 'Cosmic Gate', 'Tim White'],
  },
};

/** Clickable credits: each name renders through renderName, literals dimmed. */
export const ClickableNames: Story = {
  args: {
    names: ['Vigel', 'Tim White'],
    fallback: 'Solo Artist',
    renderName: name => (
      <span className='cursor-pointer font-medium text-primary-token underline-offset-2 hover:underline'>
        {name}
      </span>
    ),
    literalClassName: 'text-secondary-token',
  },
};

/** No credits left after normalization: the fallback line renders instead. */
export const FallbackOnly: Story = {
  args: {
    names: [],
    fallback: 'Solo Artist',
  },
};

/** Every entry is blank, so normalization leaves only the fallback. */
export const EmptyBlankNames: Story = {
  args: {
    names: ['', '  '],
    fallback: 'Tim White',
  },
};

/** Blank entries and an exact duplicate drop out of an otherwise full line. */
export const PartialBlankAndDuplicate: Story = {
  args: {
    names: ['Vigel', '', ' Vigel ', 'Tim White'],
  },
};

/** Many long credits wrap inside a narrow byline. */
export const LongContentManyCredits: Story = {
  args: {
    names: [
      'The Los Angeles After Hours Orchestra',
      'Cosmic Gate',
      'Vigel',
      'Tim White',
      'Sunrise Set Collective',
      'Midnight Radio',
    ],
    className: 'block max-w-64 text-sm text-primary-token',
  },
};

/** Hebrew credits inside a right-to-left page. */
export const Rtl: Story = {
  args: {
    names: ['עופר לב', 'שלמה ארצי', 'Tim White'],
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='he'>
        <Story />
      </div>
    ),
  ],
};
