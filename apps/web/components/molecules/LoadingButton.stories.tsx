import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { LoadingButton } from './LoadingButton';

const meta: Meta<typeof LoadingButton> = {
  title: 'Molecules/LoadingButton',
  component: LoadingButton,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    isLoading: {
      control: { type: 'boolean' },
    },
    spinnerSize: {
      control: { type: 'select' },
      options: ['xs', 'sm', 'md', 'lg'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: 'Click me',
  },
};

export const Loading: Story = {
  args: {
    isLoading: true,
    children: 'Submit',
  },
};

export const CustomLoadingText: Story = {
  args: {
    isLoading: true,
    loadingText: 'Processing...',
    children: 'Pay Now',
  },
};

export const ListenNowButton: Story = {
  args: {
    isLoading: false,
    children: 'Listen Now',
  },
};

export const ListenNowLoading: Story = {
  args: {
    isLoading: true,
    loadingText: 'Opening...',
    children: 'Listen Now',
  },
};

export const TipButton: Story = {
  args: {
    isLoading: false,
    children: '$5 Tip',
  },
};

export const TipButtonLoading: Story = {
  args: {
    isLoading: true,
    loadingText: 'Processing…',
    children: '$5 Tip',
  },
};

export const SmallSpinner: Story = {
  args: {
    isLoading: true,
    spinnerSize: 'xs',
    children: 'Save',
  },
};

export const LargeSpinner: Story = {
  args: {
    isLoading: true,
    spinnerSize: 'lg',
    loadingText: 'Please wait...',
    children: 'Submit Order',
  },
};

export const SecondaryVariant: Story = {
  args: {
    isLoading: true,
    children: 'Save Draft',
  },
};

export const OutlineVariant: Story = {
  args: {
    isLoading: true,
    children: 'Cancel Order',
  },
};

export const Disabled: Story = {
  args: {
    children: 'Disabled Button',
  },
};

export const LoadingDisabled: Story = {
  args: {
    isLoading: true,
    children: 'This should show loading',
  },
};

export const InteractiveDemo: Story = {
  render: function InteractiveDemoRender() {
    const [isLoading, setIsLoading] = React.useState(false);

    const handleClick = () => {
      setIsLoading(true);
      setTimeout(() => setIsLoading(false), 2000);
    };

    return (
      // biome-ignore lint/a11y/useKeyWithClickEvents: Story demo - click handler is intentional
      // biome-ignore lint/a11y/noStaticElementInteractions: Story demo - interactive wrapper
      // biome-ignore lint/a11y/noNoninteractiveElementInteractions: Story demo - interactive wrapper
      <div onClick={handleClick}>
        <LoadingButton isLoading={isLoading} loadingText='Processing...'>
          {isLoading ? 'Processing...' : 'Click to test'}
        </LoadingButton>
      </div>
    );
  },
};
