import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { expectNoA11yViolations } from '../test-utils/a11y';
import { SegmentControl, Tabs, TabsPrimitive } from './segment-control';

const defaultOptions = [
  { value: 'links', label: 'Links' },
  { value: 'music', label: 'Music' },
  { value: 'videos', label: 'Videos' },
] as const;

describe('Tabs pending state', () => {
  it('prevents activation while pending and restores the same action when enabled', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    const view = (disabled: boolean) => (
      <Tabs.Root defaultValue='links' onValueChange={onValueChange}>
        <Tabs.List aria-label='Profile views'>
          <Tabs.Trigger value='links'>Links</Tabs.Trigger>
          <Tabs.Trigger
            ref={ref}
            value='music'
            disabled={disabled}
            className='min-w-0'
          >
            Music
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value='music'>Music services</Tabs.Content>
      </Tabs.Root>
    );
    const { rerender } = render(view(true));
    const choice = screen.getByRole('tab', { name: 'Music' });
    expect(ref.current).toBe(choice);
    expect(choice).toBeDisabled();
    expect(choice).toHaveClass(
      'disabled:opacity-(--state-disabled-opacity)',
      'min-w-0'
    );
    await user.click(choice);
    expect(onValueChange).not.toHaveBeenCalled();
    rerender(view(false));
    expect(choice).toBeEnabled();
    await user.click(choice);
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith('music');
    expect(screen.getByRole('tabpanel', { name: 'Music' })).toHaveTextContent(
      'Music services'
    );
  });

  it('preserves arrow-key selection and skips a disabled choice', async () => {
    const user = userEvent.setup();
    render(
      <Tabs.Root defaultValue='links'>
        <Tabs.List aria-label='Profile views'>
          <Tabs.Trigger value='links'>Links</Tabs.Trigger>
          <Tabs.Trigger value='music' disabled>
            Music
          </Tabs.Trigger>
          <Tabs.Trigger value='videos'>Videos</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value='videos'>Video services</Tabs.Content>
      </Tabs.Root>
    );
    screen.getByRole('tab', { name: 'Links' }).focus();
    await user.keyboard('{ArrowRight}');
    const choice = screen.getByRole('tab', { name: 'Videos' });
    expect(choice).toHaveFocus();
    expect(choice).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Videos' })).toHaveTextContent(
      'Video services'
    );
  });

  it('retains the explicit raw primitive escape hatch (JOV-8873)', () => {
    expect(Tabs.Root).toBe(TabsPrimitive.Root);
    expect(Tabs.List).toBe(TabsPrimitive.List);
    expect(Tabs.Content).toBe(TabsPrimitive.Content);
    expect(Tabs.Trigger).not.toBe(TabsPrimitive.Trigger);
  });
});

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
    it.each([
      [undefined, ['text-app', 'h-7', 'px-2.5']],
      ['sm', ['text-xs', 'px-2']],
      ['lg', ['text-sm', 'px-4']],
    ] as const)('applies size %s (md by default)', (size, classes) => {
      render(
        <SegmentControl
          value='links'
          onValueChange={vi.fn()}
          options={defaultOptions}
          size={size}
        />
      );
      const tab = screen.getByRole('tab', { name: 'Links' });
      for (const name of classes) expect(tab.className).toContain(name);
    });
  });

  describe('Direction', () => {
    it('follows dir so ArrowLeft selects the next segment in RTL', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      render(
        <SegmentControl
          dir='rtl'
          value='links'
          onValueChange={onValueChange}
          options={defaultOptions}
        />
      );
      const first = screen.getByRole('tab', { name: 'Links' });
      act(() => first.focus());
      await user.keyboard('{ArrowLeft}');

      expect(screen.getByRole('tablist').closest('[dir]')).toHaveAttribute(
        'dir',
        'rtl'
      );
      expect(onValueChange).toHaveBeenCalledWith('music');
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

    it('allows flexed triggers to shrink within narrow controls', () => {
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

      expect(
        screen.getByRole('tab', { name: 'Audience engagement overview' })
      ).toHaveClass('min-w-0');
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

describe('SegmentControl radio semantics', () => {
  it('renders a named radio group with no tabs or tabpanels', () => {
    render(
      <SegmentControl
        semantics='radio'
        value='music'
        onValueChange={() => {}}
        options={defaultOptions}
        aria-label='Link category'
      />
    );
    const group = screen.getByRole('radiogroup', { name: 'Link category' });
    expect(group).toHaveAttribute('data-semantics', 'radio');
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: 'Music' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByRole('tabpanel', { hidden: true })).toBeNull();
    expect(document.querySelector('[aria-controls]')).toBeNull();
  });

  it('styles the checked item like an active tab', () => {
    render(
      <SegmentControl
        semantics='radio'
        value='links'
        onValueChange={() => {}}
        options={defaultOptions}
      />
    );
    const checked = screen.getByRole('radio', { name: 'Links' });
    expect(checked).toHaveAttribute('data-state', 'checked');
    expect(checked.className).toContain('aria-checked:bg-surface-0');
  });

  it('moves the choice with arrow keys and skips disabled items', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <SegmentControl
        semantics='radio'
        value='links'
        onValueChange={onValueChange}
        options={[
          { value: 'links', label: 'Links' },
          { value: 'music', label: 'Music', disabled: true },
          { value: 'videos', label: 'Videos' },
        ]}
      />
    );
    await user.tab();
    expect(screen.getByRole('radio', { name: 'Links' })).toHaveFocus();
    // Roving focus moves on the next tick; the browser checks the item
    // while the arrow key is still down.
    await user.keyboard('{ArrowRight>}');
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Videos' })).toHaveFocus()
    );
    expect(onValueChange).toHaveBeenLastCalledWith('videos');
  });

  it('follows reading order in RTL', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <SegmentControl
        semantics='radio'
        dir='rtl'
        value='links'
        onValueChange={onValueChange}
        options={defaultOptions}
      />
    );
    await user.tab();
    // Roving focus moves on the next tick; the browser checks the item
    // while the arrow key is still down.
    await user.keyboard('{ArrowLeft>}');
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Music' })).toHaveFocus()
    );
    expect(onValueChange).toHaveBeenLastCalledWith('music');
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <SegmentControl
        semantics='radio'
        variant='linear-pill'
        value='music'
        onValueChange={() => {}}
        options={defaultOptions}
        aria-label='Link category'
      />
    );
    await expectNoA11yViolations(container);
  });
});
