import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useTheme } from 'next-themes';
import { type ReactNode, useEffect, useRef } from 'react';

import { Badge } from './badge';

const meta: Meta<typeof Badge> = {
  title: 'UI/Atoms/Badge',
  component: Badge,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

type CertificationTheme = 'light' | 'dark';

const SEMANTIC_TONES = [
  ['neutral', 'Neutral'],
  ['info', 'Information'],
  ['success', 'Success'],
  ['warning', 'Warning'],
  ['error', 'Error'],
] as const;

function CertificationThemeProvider({
  children,
  theme,
}: {
  readonly children: ReactNode;
  readonly theme: CertificationTheme;
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

function BadgeCertification({ theme }: { readonly theme: CertificationTheme }) {
  return (
    <CertificationThemeProvider theme={theme}>
      <section
        className='flex flex-wrap items-center gap-2 rounded-lg bg-surface-0 p-4 text-primary-token'
        data-jovie-eval-family='Semantic badge tones'
        data-jovie-eval-owner='Badge'
        data-jovie-eval-theme={theme}
        data-jovie-eval-surface-token='--color-bg-surface-0'
        data-jovie-eval-mapping='{"neutral":"neutral","info":"info","success":"success","warning":"warning","error":"error"}'
      >
        {SEMANTIC_TONES.map(([tone, label]) => (
          <span
            className='contents'
            data-jovie-eval-variant={tone}
            data-jovie-eval-tone={tone}
            data-jovie-eval-padding-x='--space-1-5'
            data-jovie-eval-padding-y='--space-0'
            data-jovie-eval-radius='--radius-full'
            data-jovie-eval-interactive='false'
            key={tone}
          >
            <Badge data-jovie-eval-target size='sm' tone={tone}>
              {label}
            </Badge>
          </span>
        ))}
      </section>
    </CertificationThemeProvider>
  );
}

export const Default: Story = {
  args: {
    children: 'Beta',
  },
};

export const PermissionRestricted: Story = {
  args: {
    variant: 'permission-restricted',
    children: 'Admin only',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Permission-restricted state using data-state="permission-restricted" and warning tokens.',
      },
    },
  },
};

export const Variants: Story = {
  render: () => (
    <div className='flex flex-wrap items-center gap-2'>
      {(
        [
          ['default', 'Default'],
          ['secondary', 'Secondary'],
          ['outline', 'Outline'],
          ['success', 'Success'],
          ['warning', 'Warning'],
          ['destructive', 'Destructive'],
        ] as const
      ).map(([variant, label]) => (
        <Badge key={variant} variant={variant}>
          {label}
        </Badge>
      ))}
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className='flex items-center gap-2'>
      {(['sm', 'md', 'lg', 'xl'] as const).map(size => (
        <Badge key={size} size={size}>
          {size}
        </Badge>
      ))}
    </div>
  ),
};

export const Tones: Story = {
  render: () => (
    <div className='flex flex-wrap items-center gap-2'>
      {(
        ['neutral', 'info', 'success', 'accent', 'warning', 'error'] as const
      ).map(tone => (
        <Badge key={tone} tone={tone}>
          {tone}
        </Badge>
      ))}
    </div>
  ),
};

export const ConstrainedDestructiveLabel: Story = {
  render: () => (
    <div className='w-28'>
      <Badge variant='destructive'>Account deletion requires approval</Badge>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Long destructive labels wrap inside the available width without clipping or overlapping adjacent content.',
      },
    },
  },
};

export const CertificationLight: Story = {
  tags: ['jovie-certification'],
  render: () => <BadgeCertification theme='light' />,
  parameters: { backgrounds: { default: 'light' } },
};

export const CertificationDark: Story = {
  tags: ['jovie-certification'],
  render: () => <BadgeCertification theme='dark' />,
  parameters: { backgrounds: { default: 'dark' } },
};
