import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useTheme } from 'next-themes';
import { type ReactNode, useEffect, useRef } from 'react';
import { expect, userEvent, waitFor } from 'storybook/test';
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

const SECONDARY_STATE_EXAMPLES = [
  { label: 'Rest', props: {} },
  { label: 'Disabled', props: { disabled: true } },
  { label: 'Loading', props: { loading: true } },
] as const;

type ProofTheme = 'light' | 'dark';

function RootProofTheme({
  children,
  theme,
}: {
  readonly children: ReactNode;
  readonly theme: ProofTheme;
}) {
  const { theme: activeTheme, setTheme } = useTheme();
  const initialTheme = useRef(activeTheme);

  useEffect(() => {
    setTheme(theme);
    return () => {
      setTheme(initialTheme.current ?? 'dark');
    };
  }, [setTheme, theme]);

  return children;
}

function SecondaryStateSurface({ theme }: { readonly theme: ProofTheme }) {
  return (
    <section>
      <div className='rounded-xl bg-surface-0 p-5 text-primary-token'>
        <p className='mb-4 text-xs font-medium text-secondary-token'>
          {theme === 'dark' ? 'Dark Surface' : 'Light Surface'}
        </p>
        <div className='flex items-start gap-6'>
          {SECONDARY_STATE_EXAMPLES.map(({ label, props }) => (
            <div className='flex flex-col items-center gap-2' key={label}>
              <IconButton
                {...props}
                ariaLabel={`${theme === 'dark' ? 'Dark' : 'Light'} ${label}`}
                size='md'
                variant='secondary'
              >
                <PlaceholderIcon />
              </IconButton>
              <span className='text-xs text-tertiary-token'>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

async function verifySecondaryStateStory(
  canvasElement: HTMLElement,
  theme: ProofTheme
) {
  const root = canvasElement.ownerDocument.documentElement;
  await waitFor(() => expect(root).toHaveClass(theme));

  const restControl = canvasElement.querySelector<HTMLButtonElement>(
    'button[data-state="idle"]'
  );
  await expect(restControl).toBeInTheDocument();
  if (!restControl) return;

  await expect(restControl).toHaveClass('bg-transparent');
  await expect(restControl).toHaveClass('rounded-full');
  const restStyle = getComputedStyle(restControl);
  await expect(restStyle.borderRadius).not.toBe('0px');

  let observedPointerOver = false;
  restControl.addEventListener(
    'pointerover',
    () => {
      observedPointerOver = true;
    },
    { once: true }
  );
  await userEvent.hover(restControl);
  await expect(observedPointerOver).toBe(true);
  await expect(restControl).toHaveClass('hover:bg-interactive-hover');

  await userEvent.unhover(restControl);
  await userEvent.tab();
  await expect(restControl).toHaveFocus();
  await expect(restControl.matches(':focus-visible')).toBe(true);
  await expect(restControl).toHaveClass('focus-visible:bg-interactive-hover');

  let observedPointerDown = false;
  restControl.addEventListener(
    'pointerdown',
    () => {
      observedPointerDown = true;
    },
    { once: true }
  );
  await userEvent.pointer({ keys: '[MouseLeft>]', target: restControl });
  await expect(observedPointerDown).toBe(true);
  await expect(restControl).toHaveClass('active:bg-interactive-active');
  await userEvent.pointer({ keys: '[/MouseLeft]' });

  const disabledControl = canvasElement.querySelector<HTMLButtonElement>(
    'button[data-state="disabled"]'
  );
  const loadingControl = canvasElement.querySelector<HTMLButtonElement>(
    'button[data-state="loading"]'
  );
  await expect(disabledControl).toBeDisabled();
  await expect(loadingControl).toHaveAttribute('aria-busy', 'true');

  for (const control of [restControl, disabledControl, loadingControl]) {
    if (!control) continue;
    const visibleBox = control.getBoundingClientRect();
    const hitTarget = getComputedStyle(control, '::before');
    await expect([visibleBox.width, visibleBox.height]).toEqual([32, 32]);
    await expect([hitTarget.width, hitTarget.height]).toEqual(['44px', '44px']);
  }
}

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
    loading: {
      control: { type: 'boolean' },
      description: 'Loading state with stable control geometry',
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

export const SecondaryStateMatrix: Story = {
  decorators: [
    Story => (
      <RootProofTheme theme='light'>
        <Story />
      </RootProofTheme>
    ),
  ],
  render: () => <SecondaryStateSurface theme='light' />,
  play: async ({ canvasElement }) => {
    await verifySecondaryStateStory(canvasElement, 'light');
  },
  parameters: {
    backgrounds: { default: 'light' },
    docs: {
      description: {
        story:
          'Desktop light-surface proof. Rest is transparent; hover and keyboard focus reveal the circular interactive surface, pointer press uses the circular active surface, and disabled/loading keep the same control box and 44px interaction target.',
      },
    },
  },
};

export const SecondaryStateMatrixDark: Story = {
  decorators: [
    Story => (
      <RootProofTheme theme='dark'>
        <Story />
      </RootProofTheme>
    ),
  ],
  render: () => <SecondaryStateSurface theme='dark' />,
  play: async ({ canvasElement }) => {
    await verifySecondaryStateStory(canvasElement, 'dark');
  },
  parameters: {
    backgrounds: { default: 'dark' },
    docs: {
      description: {
        story: 'Desktop dark-surface proof using root-scoped dark tokens.',
      },
    },
  },
};

export const SecondaryStateMatrixMobile: Story = {
  decorators: [
    Story => (
      <RootProofTheme theme='light'>
        <Story />
      </RootProofTheme>
    ),
  ],
  render: () => <SecondaryStateSurface theme='light' />,
  play: async ({ canvasElement }) => {
    await verifySecondaryStateStory(canvasElement, 'light');
  },
  parameters: {
    backgrounds: { default: 'light' },
    viewport: { defaultViewport: 'mobile1' },
  },
};

export const SecondaryStateMatrixDarkMobile: Story = {
  decorators: [
    Story => (
      <RootProofTheme theme='dark'>
        <Story />
      </RootProofTheme>
    ),
  ],
  render: () => <SecondaryStateSurface theme='dark' />,
  play: async ({ canvasElement }) => {
    await verifySecondaryStateStory(canvasElement, 'dark');
  },
  parameters: {
    backgrounds: { default: 'dark' },
    viewport: { defaultViewport: 'mobile1' },
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
