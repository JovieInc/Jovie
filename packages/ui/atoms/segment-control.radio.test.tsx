import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '../test-utils/a11y';
import { SegmentControl } from './segment-control';

const defaultOptions = [
  { value: 'links', label: 'Links' },
  { value: 'music', label: 'Music' },
  { value: 'videos', label: 'Videos' },
] as const;

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
    expect(group.parentElement).toHaveAttribute('data-semantics', 'radio');
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: 'Music' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByRole('tabpanel', { hidden: true })).toBeNull();
    expect(document.querySelector('[aria-controls]')).toBeNull();
  });

  it('wraps the group in the same track layer as the tablist', () => {
    const { unmount } = render(
      <SegmentControl
        variant='linear-pill'
        value='links'
        onValueChange={() => {}}
        options={defaultOptions}
        aria-label='Tabs'
      />
    );
    const tablist = screen.getByRole('tablist', { name: 'Tabs' });
    const tabsTrack = tablist.parentElement?.className;
    const tabsList = tablist.className;
    unmount();

    render(
      <SegmentControl
        semantics='radio'
        variant='linear-pill'
        value='links'
        onValueChange={() => {}}
        options={defaultOptions}
        aria-label='Radios'
      />
    );
    const group = screen.getByRole('radiogroup', { name: 'Radios' });
    expect(group.parentElement?.className).toBe(tabsTrack);
    expect(group.className).toBe(tabsList);
    expect(group.className).not.toContain('inline-flex');
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
