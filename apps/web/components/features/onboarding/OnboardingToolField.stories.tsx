import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Search } from 'lucide-react';
import { useTheme } from 'next-themes';
import { type ReactNode, useEffect, useRef } from 'react';
import { expect, userEvent, waitFor } from 'storybook/test';
import {
  OnboardingToolField,
  type OnboardingToolFieldDensity,
} from './OnboardingToolField';

function ThemeFrame({
  children,
  theme,
}: {
  readonly children: ReactNode;
  readonly theme: 'light' | 'dark';
}) {
  const { theme: activeTheme, setTheme } = useTheme();
  const initialTheme = useRef(activeTheme);

  useEffect(() => {
    const previousTheme = initialTheme.current;
    setTheme(theme);
    return () => {
      setTheme(previousTheme ?? 'dark');
    };
  }, [setTheme, theme]);

  return (
    <div className='w-80 rounded-xl bg-surface-1 p-4 text-primary-token'>
      {children}
    </div>
  );
}

function FieldPreview({
  density,
  label,
  defaultValue,
  disabled = false,
}: {
  readonly density: OnboardingToolFieldDensity;
  readonly label: string;
  readonly defaultValue?: string;
  readonly disabled?: boolean;
}) {
  const fieldId = `onboarding-tool-field-story-${label.replaceAll(/\s+/g, '-').toLowerCase()}`;
  return (
    <OnboardingToolField density={density} htmlFor={fieldId}>
      {density === 'picker' ? (
        <Search className='h-3.5 w-3.5 shrink-0 text-tertiary-token' />
      ) : null}
      <span className='sr-only'>{label}</span>
      <input
        id={fieldId}
        aria-label={label}
        defaultValue={defaultValue}
        disabled={disabled}
        placeholder={label}
        className='min-w-0 flex-1 bg-transparent text-sm leading-6 text-primary-token placeholder:text-quaternary-token focus:outline-none'
      />
    </OnboardingToolField>
  );
}

const meta: Meta<typeof FieldPreview> = {
  title: 'Onboarding/Tool Field',
  component: FieldPreview,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <ThemeFrame theme='dark'>
        <Story />
      </ThemeFrame>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {
  args: {
    density: 'compact',
    label: 'Edit Proposed Handle',
    defaultValue: 'validartist',
  },
};

export const IdlePicker: Story = {
  args: {
    density: 'picker',
    label: 'Search Spotify artists',
    defaultValue: 'Test Artist',
  },
};

export const Focused: Story = {
  args: {
    density: 'compact',
    label: 'Social Profile URL',
    defaultValue: 'https://instagram.com/yourname',
  },
  play: async ({ canvasElement }) => {
    const input = canvasElement.querySelector<HTMLInputElement>(
      'input[aria-label="Social Profile URL"]'
    );
    await expect(input).toBeInTheDocument();
    if (!input) return;
    await userEvent.tab();
    await expect(input).toHaveFocus();
    await expect(input.matches(':focus-visible')).toBe(true);
    const owner = input.closest('[data-slot="onboarding-tool-field"]');
    await expect(owner).toHaveClass('focus-within:border-focus');
    await expect(owner).toHaveClass('focus-within:ring-focus/16');
  },
};

export const Disabled: Story = {
  args: {
    density: 'compact',
    label: 'Edit Proposed Handle',
    defaultValue: 'validartist',
    disabled: true,
  },
};

export const Light: Story = {
  args: {
    density: 'compact',
    label: 'Edit Proposed Handle',
    defaultValue: 'validartist',
  },
  decorators: [
    Story => (
      <ThemeFrame theme='light'>
        <Story />
      </ThemeFrame>
    ),
  ],
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(canvasElement.ownerDocument.documentElement).toHaveClass('light')
    );
  },
};

export const Dark: Story = {
  args: {
    density: 'picker',
    label: 'Search Spotify artists',
    defaultValue: 'Test Artist',
  },
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(canvasElement.ownerDocument.documentElement).toHaveClass('dark')
    );
  },
};

export const ReducedMotion: Story = {
  args: {
    density: 'compact',
    label: 'Social Profile URL',
    defaultValue: 'https://instagram.com/yourname',
  },
  play: async ({ canvasElement }) => {
    const owner = canvasElement.querySelector(
      '[data-slot="onboarding-tool-field"]'
    );
    await expect(owner).toHaveClass('motion-reduce:transition-none');
    await expect(owner).toHaveClass('duration-subtle');
  },
};

export const Geometry: Story = {
  render: () => (
    <div className='grid w-80 gap-6'>
      <div>
        <p className='mb-1 text-xs text-secondary-token'>Picker</p>
        <FieldPreview
          density='picker'
          label='Search Spotify artists'
          defaultValue='Test Artist'
        />
      </div>
      <div>
        <p className='mb-1 text-xs text-secondary-token'>Compact</p>
        <FieldPreview
          density='compact'
          label='Edit Proposed Handle'
          defaultValue='validartist'
        />
      </div>
    </div>
  ),
};
