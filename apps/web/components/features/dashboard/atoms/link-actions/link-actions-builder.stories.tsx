import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { buildLinkActions } from './link-actions-builder';

/**
 * buildLinkActions is a pure builder with no rendered output of its own; it
 * is shared by the ellipsis menu (LinkActions) and the row right-click
 * context menu. This story documents its output shape for both call sites.
 */
const meta = {
  title: 'Dashboard/Atoms/LinkActions/link-actions-builder',
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof BuiltMenuPreview>;

function BuiltMenuPreview({
  isVisible,
  withEdit,
}: {
  readonly isVisible: boolean;
  readonly withEdit: boolean;
}) {
  const items = buildLinkActions({
    isVisible,
    callbacks: {
      onEdit: withEdit ? () => {} : undefined,
      onToggle: () => {},
      onRemove: () => {},
    },
  });

  return (
    <ul className='w-56 rounded-lg border border-subtle bg-surface-1 p-1 text-app'>
      {items.map((item, index) =>
        'type' in item ? (
          <li key={`separator-${index}`} className='my-1 h-px bg-subtle' />
        ) : (
          <li
            key={item.id}
            className={
              item.destructive ? 'text-destructive' : 'text-secondary-token'
            }
          >
            {item.label}
          </li>
        )
      )}
    </ul>
  );
}

export default meta;
type Story = StoryObj<typeof meta>;

export const VisibleWithEdit: Story = {
  render: () => <BuiltMenuPreview isVisible withEdit />,
};

export const HiddenWithoutEdit: Story = {
  render: () => <BuiltMenuPreview isVisible={false} withEdit={false} />,
};
