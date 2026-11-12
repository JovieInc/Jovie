import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { InlinePalette, type PaletteSection } from './SharedCommandPalette';

const navSection: PaletteSection = {
  id: 'go-to',
  label: 'Go To',
  items: [
    {
      kind: 'nav',
      nav: {
        kind: 'nav',
        id: 'library',
        label: 'Library',
        description: 'Manage releases, images, and merch.',
        iconName: 'Music',
        surfaces: ['cmdk'],
        href: '/app/library',
      },
    },
  ],
};

const partialSection: PaletteSection = {
  id: 'releases',
  label: 'Releases',
  items: [
    {
      kind: 'entity',
      entity: { kind: 'release', id: 'release-untitled', label: 'Untitled' },
    },
  ],
};

function renderPalette(
  sections: readonly PaletteSection[],
  overrides: Partial<React.ComponentProps<typeof InlinePalette>> = {}
) {
  return render(
    <InlinePalette
      sections={sections}
      selectedIndex={0}
      setSelectedIndex={() => undefined}
      onCommit={() => undefined}
      variant='inline'
      {...overrides}
    />
  );
}

describe('SharedCommandPalette InlinePalette', () => {
  it('lists suggestions in a labelled listbox and commits the pressed row', async () => {
    const onCommit = vi.fn();
    const setSelectedIndex = vi.fn();
    const onActiveRowChange = vi.fn();
    const { container } = renderPalette([navSection, partialSection], {
      onCommit,
      setSelectedIndex,
      onActiveRowChange,
      listIdProp: 'slash-list',
    });

    const listbox = screen.getByRole('listbox', {
      name: 'Slash Command Suggestions',
    });
    expect(listbox).toHaveAttribute('id', 'slash-list');
    const [library, untitled] = screen.getAllByRole('option');
    expect(library).toHaveAttribute('aria-selected', 'true');
    expect(onActiveRowChange).toHaveBeenLastCalledWith('slash-list-row-0');

    fireEvent.mouseEnter(untitled!);
    expect(setSelectedIndex).toHaveBeenCalledWith(1);
    fireEvent.mouseDown(untitled!);
    expect(onCommit).toHaveBeenCalledWith(partialSection.items[0]);
    await expectNoA11yViolations(container);
  });

  it('shows the empty hint as a disabled option and stays axe-clean', async () => {
    const onActiveRowChange = vi.fn();
    const { container } = renderPalette([], {
      emptyHint: 'No matching commands',
      onActiveRowChange,
    });

    const empty = screen.getByRole('option', { name: 'No matching commands' });
    expect(empty).toHaveAttribute('aria-disabled', 'true');
    expect(onActiveRowChange).toHaveBeenLastCalledWith(null);
    await expectNoA11yViolations(container);
  });

  it('clamps the active descendant when the list shrinks below the selection', async () => {
    const onActiveRowChange = vi.fn();
    const { container } = renderPalette([partialSection], {
      selectedIndex: 5,
      onActiveRowChange,
      listIdProp: 'slash-list',
    });

    expect(screen.getByRole('option', { name: /Untitled/ })).toHaveAttribute(
      'id',
      'slash-list-row-0'
    );
    expect(onActiveRowChange).toHaveBeenLastCalledWith('slash-list-row-0');
    await expectNoA11yViolations(container);
  });

  it('keeps every row of a long section reachable and axe-clean', async () => {
    const longSection: PaletteSection = {
      id: 'releases',
      label: 'Releases From Every Profile You Manage',
      items: Array.from({ length: 12 }, (_, index) => ({
        kind: 'entity' as const,
        entity: {
          kind: 'release' as const,
          id: `release-${index + 1}`,
          label: `Midnight City (Extended Club Mix) ${index + 1}`,
        },
      })),
    };
    const { container } = renderPalette([longSection], { variant: 'rail' });

    expect(screen.getAllByRole('option')).toHaveLength(12);
    expect(screen.getByTestId('shared-command-palette')).toHaveClass(
      'h-full',
      'min-h-0'
    );
    await expectNoA11yViolations(container);
  });

  it('renders right-to-left labels without losing listbox semantics', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <InlinePalette
          sections={[
            {
              ...navSection,
              label: 'انتقال إلى',
              items: [
                {
                  kind: 'nav',
                  nav: {
                    kind: 'nav',
                    id: 'library-rtl',
                    label: 'المكتبة',
                    description: 'إدارة الإصدارات',
                    iconName: 'Music',
                    surfaces: ['cmdk'],
                    href: '/app/library',
                  },
                },
              ],
            },
          ]}
          selectedIndex={0}
          setSelectedIndex={() => undefined}
          onCommit={() => undefined}
          variant='inline'
        />
      </div>
    );

    expect(screen.getByText('انتقال إلى')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /المكتبة/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expectNoA11yViolations(container);
  });
});
