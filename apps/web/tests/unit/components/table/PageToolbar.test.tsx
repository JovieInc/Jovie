import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { Search } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  PAGE_TOOLBAR_ACTION_BUTTON_CLASS,
  PAGE_TOOLBAR_TAB_ACTIVE_CLASS,
  PAGE_TOOLBAR_TAB_BUTTON_CLASS,
  PageToolbar,
  PageToolbarActionButton,
  PageToolbarTabButton,
} from '@/components/organisms/table/molecules/PageToolbar';
import { findPageToolbarPrimaryCtaViolations } from '../../app/app-ia-static-guard';

vi.mock('@jovie/ui', () => ({
  Button: ({ children, ...props }: ComponentProps<'button'>) => (
    <button type='button' {...props}>
      {children}
    </button>
  ),
  TooltipShortcut: ({
    children,
    contentVariant,
  }: {
    readonly children: ReactNode;
    readonly contentVariant?: 'compact' | 'rich';
  }) => <span data-tooltip-content-variant={contentVariant}>{children}</span>,
}));

describe('PageToolbar buttons', () => {
  it('renders a flat toolbar shell by default', () => {
    const { container } = render(
      <PageToolbar start={<span>Start</span>} end={<span>End</span>} />
    );
    const toolbar = container.firstElementChild;

    expect(toolbar).toHaveClass('bg-transparent');
    expect(toolbar).not.toHaveClass('border-b');
  });

  it('adds an explicit top divider when requested', () => {
    const { container } = render(
      <PageToolbar
        start={<span>Start</span>}
        end={<span>End</span>}
        topDivider
      />
    );
    const toolbar = container.firstElementChild;

    expect(toolbar).toHaveClass('border-t', 'border-subtle');
  });

  it('renders action buttons accessibly', () => {
    render(<PageToolbarActionButton label='Display' icon={<Search />} />);

    const button = screen.getByRole('button', { name: 'Display' });
    expect(button).toBeInTheDocument();
    expect(button).toBeEnabled();
  });

  it('marks active tab buttons as pressed', () => {
    render(<PageToolbarTabButton label='Releases' active />);

    const button = screen.getByRole('button', { name: 'Releases' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps inactive view tabs quiet and gives the active view a surface, not a ring', () => {
    expect(PAGE_TOOLBAR_TAB_BUTTON_CLASS).toContain('text-tertiary-token');
    expect(PAGE_TOOLBAR_TAB_ACTIVE_CLASS).toContain('bg-surface-1');
    expect(PAGE_TOOLBAR_TAB_ACTIVE_CLASS).not.toContain('ring-');
  });

  it('keeps toolbar actions borderless and transparent until hover or keyboard focus', () => {
    expect(PAGE_TOOLBAR_ACTION_BUTTON_CLASS).toContain('rounded-full');
    expect(PAGE_TOOLBAR_ACTION_BUTTON_CLASS).toContain('border-0');
    expect(PAGE_TOOLBAR_ACTION_BUTTON_CLASS).toContain('bg-transparent');
    expect(PAGE_TOOLBAR_ACTION_BUTTON_CLASS).toContain(
      'hover:bg-surface-1'
    );
    expect(PAGE_TOOLBAR_ACTION_BUTTON_CLASS).toContain(
      'focus-visible:bg-surface-1'
    );
  });

  it('keeps icon-only actions accessible', () => {
    render(
      <PageToolbarActionButton
        label='Preview'
        icon={<Search />}
        iconOnly
        ariaLabel='Toggle preview'
        tooltipLabel='Toggle preview'
      />
    );

    const button = screen.getByRole('button', { name: 'Toggle preview' });
    expect(button).toBeInTheDocument();
    expect(button).toBeEnabled();
    expect(button.parentElement).toHaveAttribute(
      'data-tooltip-content-variant',
      'compact'
    );
  });
});

describe('PageToolbar primary CTA guard', () => {
  const webRoot = resolve(__dirname, '../../../..');

  function readProductionTsxFiles(directory: string) {
    const files: Array<{ path: string; source: string }> = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        files.push(...readProductionTsxFiles(absolutePath));
      } else if (
        entry.name.endsWith('.tsx') &&
        !/\.(?:test|stories)\.tsx$/.test(entry.name)
      ) {
        files.push({
          path: relative(webRoot, absolutePath).replaceAll('\\', '/'),
          source: readFileSync(absolutePath, 'utf8'),
        });
      }
    }
    return files;
  }

  it('allows one primary pill plus secondary toolbar actions', () => {
    const compliant = `
      const toolbarEnd = (
        <>
          <Button size='sm'>Create</Button>
          <Button variant='secondary' size='sm'>Cancel</Button>
        </>
      );
      export function Fixture() {
        return <PageToolbar start={<span>Tasks</span>} end={toolbarEnd} />;
      }
    `;

    expect(
      findPageToolbarPrimaryCtaViolations([
        { path: 'CompliantToolbar.tsx', source: compliant },
      ])
    ).toEqual([]);
  });

  it('catches two primary pills in one toolbar independently', () => {
    const violation = `
      export function Fixture() {
        return (
          <PageToolbar
            start={<Button>Create</Button>}
            end={<Button variant='primary'>Import</Button>}
          />
        );
      }
    `;

    expect(
      findPageToolbarPrimaryCtaViolations([
        { path: 'ViolatingToolbar.tsx', source: violation },
      ])
    ).toEqual([
      'ViolatingToolbar.tsx: PageToolbar has 2 primary pill CTAs (maximum 1)',
    ]);
  });

  it('keeps every production PageToolbar at one primary pill CTA or fewer', () => {
    const files = [
      ...readProductionTsxFiles(join(webRoot, 'app')),
      ...readProductionTsxFiles(join(webRoot, 'components')),
    ];

    expect(findPageToolbarPrimaryCtaViolations(files)).toEqual([]);
  });
});
