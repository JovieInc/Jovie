import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { IconButton } from './icon-button';
import {
  ICON_BUTTON_SIZE_NAMES,
  ICON_BUTTON_VARIANT_NAMES,
} from './icon-button-contract';

const PlaceholderIcon = () => (
  <svg
    aria-hidden='true'
    viewBox='0 0 16 16'
    fill='none'
    stroke='currentColor'
    strokeWidth='1.5'
    className='h-4 w-4'
  >
    <circle cx='8' cy='8' r='6' />
  </svg>
);

const meta: Meta<typeof IconButton> = {
  title: 'shadcn/IconButton',
  component: IconButton,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Canonical icon-only button (JOV-4871): one size/variant contract for every icon button, built on the base Button so the focus ring, 44px hit target, and reduced-motion behavior are identical everywhere.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: [...ICON_BUTTON_VARIANT_NAMES],
      description: 'Visual style variant',
    },
    size: {
      control: { type: 'select' },
      options: [...ICON_BUTTON_SIZE_NAMES],
      description: 'Container size: xs 24 / sm 28 / md 32 / lg 40 / xl 44px',
    },
    disabled: {
      control: { type: 'boolean' },
      description: 'Disabled state',
    },
    asChild: {
      control: { type: 'boolean' },
      description: 'Render as child element (Radix Slot)',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Ghost: Story = {
  args: {
    ariaLabel: 'Ghost action',
    variant: 'ghost',
    size: 'lg',
    children: <PlaceholderIcon />,
  },
};

export const Surface: Story = {
  args: {
    ariaLabel: 'Surface action',
    variant: 'surface',
    size: 'lg',
    children: <PlaceholderIcon />,
  },
};

export const Frosted: Story = {
  args: {
    ariaLabel: 'Frosted action',
    variant: 'frosted',
    size: 'lg',
    children: <PlaceholderIcon />,
  },
};

export const Secondary: Story = {
  args: {
    ariaLabel: 'Secondary action',
    variant: 'secondary',
    size: 'lg',
    children: <PlaceholderIcon />,
  },
};

export const Outline: Story = {
  args: {
    ariaLabel: 'Outline action',
    variant: 'outline',
    size: 'lg',
    children: <PlaceholderIcon />,
  },
};

export const Pearl: Story = {
  args: {
    ariaLabel: 'Pearl action',
    variant: 'pearl',
    size: 'lg',
    children: <PlaceholderIcon />,
  },
};

export const PearlQuiet: Story = {
  args: {
    ariaLabel: 'Quiet pearl action',
    variant: 'pearlQuiet',
    size: 'lg',
    children: <PlaceholderIcon />,
  },
};

export const Control: Story = {
  args: {
    ariaLabel: 'Control action',
    variant: 'control',
    size: 'sm',
    children: <PlaceholderIcon />,
  },
};

export const Inline: Story = {
  args: {
    ariaLabel: 'Inline action',
    variant: 'inline',
    size: 'lg',
    children: <PlaceholderIcon />,
  },
};

export const AllSizes: Story = {
  render: () => (
    <div className='flex items-center gap-3'>
      {ICON_BUTTON_SIZE_NAMES.map(size => (
        <IconButton key={size} ariaLabel={`${size} action`} size={size}>
          <PlaceholderIcon />
        </IconButton>
      ))}
    </div>
  ),
};
