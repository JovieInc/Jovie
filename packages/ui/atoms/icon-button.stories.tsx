import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ChevronLeft, Ellipsis, RotateCcw, Share2 } from 'lucide-react';
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
  { label: 'Destructive', props: { destructive: true } },
] as const;

type ProofTheme = 'light' | 'dark';

function SecondaryStateSurface({ theme }: { readonly theme: ProofTheme }) {
  return (
    <section data-proof-theme={theme} style={{ colorScheme: theme }}>
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
  const document = canvasElement.ownerDocument;
  await waitFor(() =>
    expect(
      ['light', 'dark'].some(value =>
        document.documentElement.classList.contains(value)
      )
    ).toBe(true)
  );
  const rootTheme = document.documentElement.className;
  const storedTheme = document.defaultView?.localStorage.getItem(
    'jovie-theme-storybook'
  );
  const scope = canvasElement.querySelector('[data-proof-theme]');
  await expect(scope).toHaveAttribute('data-proof-theme', theme);
  if (!scope) throw new Error('Missing secondary-state proof theme scope');
  await waitFor(() => expect(getComputedStyle(scope).colorScheme).toBe(theme));

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

  await expect(document.documentElement.className).toBe(rootTheme);
  await expect(
    document.defaultView?.localStorage.getItem('jovie-theme-storybook')
  ).toBe(storedTheme);
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
  render: () => <SecondaryStateSurface theme='dark' />,
  play: async ({ canvasElement }) => {
    await verifySecondaryStateStory(canvasElement, 'dark');
  },
  parameters: {
    backgrounds: { default: 'dark' },
    docs: {
      description: {
        story: 'Desktop dark-surface proof using locally scoped dark tokens.',
      },
    },
  },
};

export const SecondaryStateMatrixMobile: Story = {
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

export const AllVariants: Story = {
  render: () => (
    <div className='grid grid-cols-3 gap-5 rounded-xl bg-surface-0 p-6'>
      {ICON_BUTTON_VARIANT_NAMES.map(variant => (
        <div className='flex flex-col items-center gap-2' key={variant}>
          <IconButton
            ariaLabel={`${variant} action`}
            size='md'
            variant={variant}
          >
            <PlaceholderIcon />
          </IconButton>
          <span className='text-xs text-tertiary-token'>{variant}</span>
        </div>
      ))}
    </div>
  ),
};

// Certificate states

export const ErrorState: Story = {
  render: () => (
    <div className='flex w-72 items-center gap-3 rounded-xl bg-surface-1 px-3 py-2'>
      <p className='min-w-0 flex-1 truncate text-xs text-error-text'>
        Upload failed: cover-art.png
      </p>
      <IconButton
        ariaLabel='Retry upload'
        variant='secondary'
        size='md'
        destructive
      >
        <RotateCcw aria-hidden='true' />
      </IconButton>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Failed row: the destructive tone marks the retry control while the row text names what failed.',
      },
    },
  },
};

export const LongContent: Story = {
  render: () => (
    <div className='flex w-60 items-center gap-1 rounded-xl bg-surface-1 px-3 py-2'>
      <p className='min-w-0 flex-1 truncate text-xs text-primary-token'>
        Midnight Sessions (Extended Club Mix) feat. The Late Night Collective
      </p>
      <IconButton
        ariaLabel='Share Midnight Sessions (Extended Club Mix) feat. The Late Night Collective'
        size='md'
      >
        <Share2 aria-hidden='true' />
      </IconButton>
      <IconButton ariaLabel='More actions for this release' size='md'>
        <Ellipsis aria-hidden='true' />
      </IconButton>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'A long sibling title truncates and a long accessible name stays off-screen; the icon faces keep their fixed size in a narrow row.',
      },
    },
  },
};

export const Rtl: Story = {
  render: () => (
    <div
      dir='rtl'
      className='flex w-60 items-center gap-1 rounded-xl bg-surface-1 px-3 py-2'
    >
      <IconButton ariaLabel='رجوع' size='md'>
        <ChevronLeft className='rtl:rotate-180' aria-hidden='true' />
      </IconButton>
      <p className='min-w-0 flex-1 truncate text-xs text-primary-token'>
        جلسات منتصف الليل مع فرقة السهرة الطويلة
      </p>
      <IconButton ariaLabel='مشاركة' size='md'>
        <Share2 aria-hidden='true' />
      </IconButton>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Right-to-left row: controls follow the inline direction, the back glyph mirrors, and the Arabic title truncates between them.',
      },
    },
  },
};
