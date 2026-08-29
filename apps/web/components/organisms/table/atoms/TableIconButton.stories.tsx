import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MoreHorizontal, Trash2 } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect } from 'react';
import { HeaderBulkActions } from '../molecules/HeaderBulkActions';
import { TableIconButton } from './TableIconButton';

const meta: Meta<typeof TableIconButton> = {
  title: 'Organisms/Table/TableIconButton',
  component: TableIconButton,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['className'],
    },
  },
  args: {
    onClick: () => undefined,
  },
};

export default meta;
type Story = StoryObj<typeof TableIconButton>;

function TableActionControlsReview({
  theme,
}: {
  readonly theme: 'light' | 'dark';
}) {
  const { setTheme } = useTheme();

  useEffect(() => {
    setTheme(theme);
  }, [setTheme, theme]);

  return (
    <div
      data-table-action-family-review={theme}
      className='flex w-80 flex-col gap-4 rounded-lg border border-subtle bg-surface-0 p-4 text-primary-token shadow-sm'
    >
      <fieldset aria-label='Selection actions' className='m-0 border-0 p-0'>
        <HeaderBulkActions
          selectedCount={3}
          bulkActions={[
            { label: 'Archive', onClick: () => undefined },
            { label: 'Export', onClick: () => undefined, disabled: true },
            {
              label: 'Delete',
              onClick: () => undefined,
              variant: 'destructive',
            },
          ]}
          onClearSelection={() => undefined}
        />
      </fieldset>
      <fieldset
        aria-label='Row actions'
        className='m-0 flex items-center justify-end gap-2 border-0 p-0'
      >
        <TableIconButton
          ariaLabel='More Actions'
          tooltip='More Actions'
          icon={<MoreHorizontal aria-hidden='true' />}
          onClick={() => undefined}
        />
        <TableIconButton
          ariaLabel='Delete Row'
          tooltip='Delete Row'
          variant='danger'
          icon={<Trash2 aria-hidden='true' />}
          onClick={() => undefined}
        />
      </fieldset>
    </div>
  );
}

export const Default: Story = {
  args: {
    ariaLabel: 'More Actions',
    tooltip: 'More Actions',
    icon: <MoreHorizontal aria-hidden='true' />,
  },
};

export const Danger: Story = {
  args: {
    ariaLabel: 'Delete Row',
    tooltip: 'Delete Row',
    variant: 'danger',
    icon: <Trash2 aria-hidden='true' />,
  },
};

export const FamilyReviewDark: Story = {
  parameters: {
    backgrounds: { default: 'dark' },
    jovie: {
      canonicalOwner: '@jovie/ui/IconButton',
      reviewContracts: [
        'anatomy',
        'tokens',
        'theme-pair',
        'wcag-aa',
        'zoom-200',
        'keyboard-focus',
        'hover-stability',
      ],
    },
  },
  render: () => <TableActionControlsReview theme='dark' />,
};

export const FamilyReviewLight: Story = {
  parameters: {
    backgrounds: { default: 'light' },
    jovie: {
      canonicalOwner: '@jovie/ui/IconButton',
      reviewContracts: [
        'anatomy',
        'tokens',
        'theme-pair',
        'wcag-aa',
        'zoom-200',
        'keyboard-focus',
        'hover-stability',
      ],
    },
  },
  render: () => <TableActionControlsReview theme='light' />,
};
