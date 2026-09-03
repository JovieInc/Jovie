import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SegmentControl } from './segment-control';

const defaultOptions = [
  { value: 'links', label: 'Links' },
  { value: 'music', label: 'Music' },
  { value: 'videos', label: 'Videos' },
] as const;

describe('SegmentControl', () => {
  describe('Basic Rendering', () => {
    it('renders all options', () => {
      render(
        <SegmentControl
          value='links'
          onValueChange={vi.fn()}
          options={defaultOptions}
        />
      );
      expect(screen.getByRole('tab', { name: 'Links' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Music' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Videos' })).toBeInTheDocument();
    });

    it('renders as a named tablist by default', () => {
      render(
        <SegmentControl
          value='links'
          onValueChange={vi.fn()}
          options={defaultOptions}
        />
      );
      expect(
        screen.getByRole('tablist', { name: 'Choose a view' })
      ).toBeInTheDocument();
    });

    it('renders tabs', () => {
      render(
        <SegmentControl
          value='links'
          onValueChange={vi.fn()}
          options={defaultOptions}
        />
      );
      const tabs = screen.getAllByRole('tab');
      expect(tabs).toHaveLength(3);
    });
  });

  describe('Selection', () => {
    it('shows selected value', () => {
      render(
        <SegmentControl
          value='music'
          onValueChange={vi.fn()}
          options={defaultOptions}
        />
      );
      const musicTab = screen.getByRole('tab', { name: 'Music' });
      expect(musicTab).toHaveAttribute('data-state', 'active');
    });

    it('calls onValueChange when option is clicked', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      render(
        <SegmentControl
          value='links'
          onValueChange={onValueChange}
          options={defaultOptions}
        />
      );

      await user.click(screen.getByRole('tab', { name: 'Music' }));

      expect(onValueChange).toHaveBeenCalledWith('music');
    });

    it('updates selected state on value change', () => {
      const { rerender } = render(
        <SegmentControl
          value='links'
          onValueChange={vi.fn()}
          options={defaultOptions}
        />
      );

      expect(screen.getByRole('tab', { name: 'Links' })).toHaveAttribute(
        'data-state',
        'active'
      );

      rerender(
        <SegmentControl
          value='music'
          onValueChange={vi.fn()}
          options={defaultOptions}
        />
      );

      expect(screen.getByRole('tab', { name: 'Music' })).toHaveAttribute(
        'data-state',
        'active'
      );
      expect(screen.getByRole('tab', { name: 'Links' })).toHaveAttribute(
        'data-state',
        'inactive'
      );
    });
  });

  describe('Disabled Options', () => {
    it('disables option when disabled is true', () => {
      const options = [
        { value: 'links', label: 'Links' },
        { value: 'music', label: 'Music', disabled: true },
      ];

      render(
        <SegmentControl
          value='links'
          onValueChange={vi.fn()}
          options={options}
        />
      );

      expect(screen.getByRole('tab', { name: 'Music' })).toBeDisabled();
    });

    it('does not call onValueChange when clicking disabled option', () => {
      const onValueChange = vi.fn();
      const options = [
        { value: 'links', label: 'Links' },
        { value: 'music', label: 'Music', disabled: true },
      ];

      render(
        <SegmentControl
          value='links'
          onValueChange={onValueChange}
          options={options}
        />
      );

      fireEvent.click(screen.getByRole('tab', { name: 'Music' }));

      expect(onValueChange).not.toHaveBeenCalled();
    });
  });

  describe('Sizes', () => {
    it('applies md size by default', () => {
      render(
        <SegmentControl
          value='links'
          onValueChange={vi.fn()}
          options={defaultOptions}
          data-testid='segment'
        />
      );
      const tab = screen.getByRole('tab', { name: 'Links' });
      expect(tab.className).toContain('text-app');
      expect(tab.className).toContain('h-7');
      expect(tab.className).toContain('px-2.5');
    });

    it('applies sm size', () => {
      render(
        <SegmentControl
          value='links'
          onValueChange={vi.fn()}
          options={defaultOptions}
          size='sm'
        />
      );
      const tab = screen.getByRole('tab', { name: 'Links' });
      expect(tab.className).toContain('text-xs');
      expect(tab.className).toContain('px-2');
    });

    it('applies lg size', () => {
      render(
        <SegmentControl
          value='links'
          onValueChange={vi.fn()}
          options={defaultOptions}
          size='lg'
        />
      );
      const tab = screen.getByRole('tab', { name: 'Links' });
      expect(tab.className).toContain('text-sm');
      expect(tab.className).toContain('px-4');
    });
  });

  describe('Variants', () => {
    it('applies default variant by default', () => {
      const { container } = render(
        <SegmentControl
          value='links'
          onValueChange={vi.fn()}
          options={defaultOptions}
        />
      );
      const root = container.firstChild;
      expect((root as HTMLElement).className).toContain('border-subtle');
    });

    it('applies ghost variant', () => {
      const { container } = render(
        <SegmentControl
          value='links'
          onValueChange={vi.fn()}
          options={defaultOptions}
          variant='ghost'
        />
      );
      const root = container.firstChild;
      expect((root as HTMLElement).className).toContain('border-transparent');
      expect((root as HTMLElement).className).toContain('bg-transparent');
    });

    it('keeps default variants on existing surface padding', () => {
      const { container } = render(
        <SegmentControl
          value='links'
          onValueChange={vi.fn()}
          options={defaultOptions}
          variant='default'
          size='sm'
        />
      );

      expect((container.firstChild as HTMLElement).className).toContain(
        'p-0.5'
      );
    });

    it('renders the linear pill indicator', () => {
      const { container } = render(
        <SegmentControl
          value='links'
          onValueChange={vi.fn()}
          options={defaultOptions}
          variant='linear-pill'
          layout='hug'
        />
      );

      const activeTab = screen.getByRole('tab', {
        name: 'Links',
        selected: true,
      });
      const indicator = screen
        .getByRole('tablist')
        .querySelector(':scope > [aria-hidden="true"]');

      expect(activeTab).toHaveAttribute('data-state', 'active');
      expect(indicator).toBeInTheDocument();
      expect((container.firstChild as HTMLElement).className).toContain(
        'bg-(--linear-bg-button)'
      );
      expect((container.firstChild as HTMLElement).className).toContain(
        'p-(--linear-pill-track-padding)'
      );
      expect(indicator).toHaveClass('inset-y-0', 'left-0');
      expect((container.firstChild as HTMLElement).className).not.toContain(
        'p-0.5'
      );
      expect(activeTab.className).toContain('font-caption');
      expect(activeTab.className).toContain(
        'tracking-(--linear-caption-tracking)'
      );
      expect(activeTab.className).toContain('text-caption');
      expect(activeTab.className).not.toContain('font-medium');
      expect(activeTab.className).not.toContain('tracking-[-0.01em]');
      expect(activeTab.className).not.toContain('text-xs');
    });

    it('resyncs and disconnects the indicator resize observer', () => {
      const originalResizeObserver = globalThis.ResizeObserver;
      const observe = vi.fn();
      const disconnect = vi.fn();
      let notify = () => undefined;

      class TestResizeObserver {
        constructor(callback: ResizeObserverCallback) {
          notify = () => callback([], this as unknown as ResizeObserver);
        }
        observe = observe;
        unobserve = vi.fn();
        disconnect = disconnect;
      }

      globalThis.ResizeObserver =
        TestResizeObserver as unknown as typeof ResizeObserver;

      try {
        const { unmount } = render(
          <SegmentControl
            value='links'
            onValueChange={vi.fn()}
            options={defaultOptions}
            variant='linear-pill'
          />
        );

        expect(observe).toHaveBeenCalledTimes(4);
        act(() => notify());
        unmount();
        expect(disconnect).toHaveBeenCalledOnce();
      } finally {
        globalThis.ResizeObserver = originalResizeObserver;
      }
    });

    it('falls back to the window resize event without ResizeObserver', () => {
      const originalResizeObserver = globalThis.ResizeObserver;
      const addEventListener = vi.spyOn(globalThis, 'addEventListener');
      const removeEventListener = vi.spyOn(globalThis, 'removeEventListener');
      globalThis.ResizeObserver = undefined as unknown as typeof ResizeObserver;

      try {
        const { unmount } = render(
          <SegmentControl
            value='links'
            onValueChange={vi.fn()}
            options={defaultOptions}
            variant='linear-pill'
          />
        );

        expect(addEventListener).toHaveBeenCalledWith(
          'resize',
          expect.any(Function)
        );
        unmount();
        expect(removeEventListener).toHaveBeenCalledWith(
          'resize',
          expect.any(Function)
        );
      } finally {
        globalThis.ResizeObserver = originalResizeObserver;
        addEventListener.mockRestore();
        removeEventListener.mockRestore();
      }
    });

    it('resyncs the indicator after document fonts are ready', async () => {
      const descriptor = Object.getOwnPropertyDescriptor(document, 'fonts');
      Object.defineProperty(document, 'fonts', {
        configurable: true,
        value: { ready: Promise.resolve() },
      });

      try {
        await act(async () => {
          render(
            <SegmentControl
              value='links'
              onValueChange={vi.fn()}
              options={defaultOptions}
              variant='linear-pill'
            />
          );
          await Promise.resolve();
        });

        expect(
          screen
            .getByRole('tablist')
            .querySelector(':scope > [aria-hidden="true"]')
        ).toBeInTheDocument();
      } finally {
        if (descriptor) {
          Object.defineProperty(document, 'fonts', descriptor);
        } else {
          Reflect.deleteProperty(document, 'fonts');
        }
      }
    });
  });

  describe('Layout', () => {
    it('uses fill layout by default', () => {
      render(
        <SegmentControl
          value='links'
          onValueChange={vi.fn()}
          options={defaultOptions}
        />
      );

      expect(screen.getByRole('tab', { name: 'Links' }).className).toContain(
        'flex-1'
      );
    });

    it('uses hug layout without stretching tabs', () => {
      render(
        <SegmentControl
          value='links'
          onValueChange={vi.fn()}
          options={defaultOptions}
          variant='linear-pill'
          layout='hug'
        />
      );

      expect(
        screen.getByRole('tab', { name: 'Links' }).className
      ).not.toContain('flex-1');
    });

    it('applies responsive layout classes to the tablist', () => {
      render(
        <SegmentControl
          value='links'
          onValueChange={vi.fn()}
          options={defaultOptions}
          listClassName='flex-wrap gap-1.5'
        />
      );

      expect(screen.getByRole('tablist')).toHaveClass('flex-wrap', 'gap-1.5');
    });

    it('keeps long labels inside a shrinking text slot', () => {
      render(
        <SegmentControl
          value='audience'
          onValueChange={vi.fn()}
          options={[
            { value: 'audience', label: 'Audience engagement overview' },
            { value: 'sources', label: 'Acquisition sources' },
          ]}
        />
      );

      expect(screen.getByText('Audience engagement overview')).toHaveClass(
        'min-w-0',
        'overflow-hidden',
        'text-ellipsis',
        'whitespace-nowrap'
      );
    });
  });

  describe('Accessibility', () => {
    it('supports aria-label', () => {
      render(
        <SegmentControl
          value='links'
          onValueChange={vi.fn()}
          options={defaultOptions}
          aria-label='Select category'
        />
      );
      expect(
        screen.getByRole('tablist', { name: 'Select category' })
      ).toBeInTheDocument();
    });

    it('supports accessible names for icon-only options', () => {
      render(
        <SegmentControl
          value='grid'
          onValueChange={vi.fn()}
          options={[
            {
              value: 'grid',
              label: <span aria-hidden='true'>▦</span>,
              ariaLabel: 'Grid view',
            },
            {
              value: 'list',
              label: <span aria-hidden='true'>☷</span>,
              ariaLabel: 'List view',
            },
          ]}
        />
      );

      expect(screen.getByRole('tab', { name: 'Grid view' })).toHaveAttribute(
        'aria-selected',
        'true'
      );
      expect(
        screen.getByRole('tab', { name: 'List view' })
      ).toBeInTheDocument();
    });

    it('keeps the generated tab-panel relationship for standalone controls', () => {
      render(
        <SegmentControl
          value='links'
          onValueChange={vi.fn()}
          options={defaultOptions}
        />
      );

      const activeTab = screen.getByRole('tab', { name: 'Links' });
      const panelId = activeTab.getAttribute('aria-controls');
      expect(panelId).toBeTruthy();
      expect(document.getElementById(panelId!)).toHaveAttribute(
        'role',
        'tabpanel'
      );
    });

    it('wires external tabpanel ids without rendering internal hidden panels', () => {
      render(
        <SegmentControl
          value='7d'
          onValueChange={vi.fn()}
          options={[
            {
              value: '7d',
              label: '7D',
              id: 'analytics-tab-7d',
              ariaControls: 'analytics-panel',
            },
            {
              value: '30d',
              label: '30D',
              id: 'analytics-tab-30d',
              ariaControls: 'analytics-panel',
            },
          ]}
          aria-label='Select Analytics Range'
          renderHiddenPanels={false}
        />
      );

      const activeTab = screen.getByRole('tab', { name: '7D' });
      expect(activeTab).toHaveAttribute('id', 'analytics-tab-7d');
      expect(activeTab).toHaveAttribute('aria-controls', 'analytics-panel');
      expect(activeTab).toHaveAttribute('aria-selected', 'true');
      expect(
        screen.queryByRole('tabpanel', { hidden: true })
      ).not.toBeInTheDocument();
    });

    it('tabs have proper aria attributes', () => {
      render(
        <SegmentControl
          value='links'
          onValueChange={vi.fn()}
          options={defaultOptions}
        />
      );
      const tab = screen.getByRole('tab', { name: 'Links' });
      expect(tab).toHaveAttribute('aria-selected', 'true');
    });

    it('disabled tabs expose native and ARIA disabled state', () => {
      render(
        <SegmentControl
          value='links'
          onValueChange={vi.fn()}
          options={[
            { value: 'links', label: 'Links' },
            { value: 'music', label: 'Music', disabled: true },
          ]}
        />
      );

      const disabledTab = screen.getByRole('tab', { name: 'Music' });
      expect(disabledTab).toBeDisabled();
      expect(disabledTab).toHaveAttribute('aria-disabled', 'true');
      expect(disabledTab).toHaveAttribute('data-disabled', '');
    });

    it('inactive tabs have aria-selected false', () => {
      render(
        <SegmentControl
          value='links'
          onValueChange={vi.fn()}
          options={defaultOptions}
        />
      );
      const tab = screen.getByRole('tab', { name: 'Music' });
      expect(tab).toHaveAttribute('aria-selected', 'false');
    });
  });

  describe('Keyboard Navigation', () => {
    it('navigates with arrow keys', () => {
      render(
        <SegmentControl
          value='links'
          onValueChange={vi.fn()}
          options={defaultOptions}
        />
      );

      const linksTab = screen.getByRole('tab', { name: 'Links' });
      linksTab.focus();
      expect(linksTab).toHaveFocus();

      fireEvent.keyDown(linksTab, { key: 'ArrowRight' });
      // Radix handles focus management
    });
  });

  describe('Styling', () => {
    it('applies base container styling', () => {
      const { container } = render(
        <SegmentControl
          value='links'
          onValueChange={vi.fn()}
          options={defaultOptions}
        />
      );
      const root = container.firstChild;
      expect((root as HTMLElement).className).toContain('inline-flex');
      expect((root as HTMLElement).className).toContain('rounded-full');
      expect(root).toHaveAttribute('data-layout', 'fill');
      expect(root).toHaveAttribute('data-size', 'md');
      expect(root).toHaveAttribute('data-variant', 'default');
    });

    it('merges custom className', () => {
      const { container } = render(
        <SegmentControl
          value='links'
          onValueChange={vi.fn()}
          options={defaultOptions}
          className='custom-class'
        />
      );
      const root = container.firstChild;
      expect((root as HTMLElement).className).toContain('custom-class');
    });

    it('merges custom triggerClassName', () => {
      render(
        <SegmentControl
          value='links'
          onValueChange={vi.fn()}
          options={defaultOptions}
          triggerClassName='custom-trigger-class'
        />
      );
      const tab = screen.getByRole('tab', { name: 'Links' });
      expect(tab.className).toContain('custom-trigger-class');
    });

    it('applies focus-visible styles', () => {
      render(
        <SegmentControl
          value='links'
          onValueChange={vi.fn()}
          options={defaultOptions}
        />
      );
      const tab = screen.getByRole('tab', { name: 'Links' });
      expect(tab.className).toContain('focus-visible:outline-none');
      expect(tab.className).toContain('focus-visible:ring-2');
      expect(tab.className).toContain('focus-visible:ring-focus/55');
      expect(tab.className).toContain('focus-visible:ring-offset-surface-page');
    });

    it('uses a 44px target and reduced-motion-safe semantic timing', () => {
      render(
        <SegmentControl
          value='links'
          onValueChange={vi.fn()}
          options={defaultOptions}
        />
      );
      const tab = screen.getByRole('tab', { name: 'Links' });
      expect(tab.className).toContain('before:h-11');
      expect(tab.className).toContain('before:min-w-11');
      expect(tab.className).toContain('duration-subtle');
      expect(tab.className).toContain('ease-subtle');
      expect(tab.className).toContain('motion-reduce:transition-none');
    });
  });

  describe('React Node Labels', () => {
    it('supports React node labels', () => {
      const options = [
        {
          value: 'links',
          label: (
            <span>
              <span data-testid='icon'>🔗</span> Links
            </span>
          ),
        },
        { value: 'music', label: 'Music' },
      ];

      render(
        <SegmentControl
          value='links'
          onValueChange={vi.fn()}
          options={options}
        />
      );

      expect(screen.getByTestId('icon')).toBeInTheDocument();
    });
  });
});
