import { CommonDropdown } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  buildFeedbackActions,
  type FeedbackActionTarget,
  feedbackActionsToContextMenuItems,
  feedbackActionsToDropdownItems,
} from './feedback-actions';

const pendingItem: FeedbackActionTarget = { id: 'fb_1', status: 'pending' };

function handlers(pendingIds: readonly string[] = []) {
  return {
    onCopyAsMarkdown: vi.fn(),
    onDismiss: vi.fn(),
    isDismissPending: vi.fn((id: string) => pendingIds.includes(id)),
  };
}

describe('buildFeedbackActions', () => {
  it('builds copy then a destructive dismiss bound to the item', () => {
    const h = handlers();
    const actions = buildFeedbackActions(pendingItem, h);
    expect(actions.map(action => action.id)).toEqual([
      'copy-feedback-markdown',
      'dismiss-feedback',
    ]);
    actions[0]!.onClick?.();
    expect(h.onCopyAsMarkdown).toHaveBeenCalledWith(pendingItem);
    actions[1]!.onClick?.();
    expect(h.onDismiss).toHaveBeenCalledWith(pendingItem);
    expect(actions[1]).toMatchObject({ disabled: false, destructive: true });
  });

  it('disables dismiss for dismissed feedback and while a dismiss is pending', () => {
    expect(
      buildFeedbackActions({ id: 'fb_2', status: 'dismissed' }, handlers())[1]
    ).toMatchObject({ disabled: true });
    const h = handlers(['fb_1']);
    expect(buildFeedbackActions(pendingItem, h)[1]).toMatchObject({
      disabled: true,
    });
    expect(h.isDismissPending).toHaveBeenCalledWith('fb_1');
  });
});

describe('feedback action adapters', () => {
  it('separates context menu actions and keeps the destructive flag', () => {
    const items = feedbackActionsToContextMenuItems(
      buildFeedbackActions(pendingItem, handlers())
    );
    expect(items.map(item => ('id' in item ? item.id : item.type))).toEqual([
      'copy-feedback-markdown',
      'separator',
      'dismiss-feedback',
    ]);
    expect(items[2]).toMatchObject({ destructive: true, label: 'Dismiss' });
  });

  it('maps dismiss to a destructive dropdown action after a separator', () => {
    const items = feedbackActionsToDropdownItems(
      buildFeedbackActions(pendingItem, handlers())
    );
    expect(items.map(item => item.id)).toEqual([
      'copy-feedback-markdown',
      'feedback-action-separator-1',
      'dismiss-feedback',
    ]);
    expect(items[0]).toMatchObject({ type: 'action', variant: 'default' });
    expect(items[2]).toMatchObject({ type: 'action', variant: 'destructive' });
  });

  it('runs the chosen action from the rendered menu, axe-clean', async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(
      <CommonDropdown
        variant='dropdown'
        size='compact'
        items={feedbackActionsToDropdownItems(
          buildFeedbackActions(pendingItem, h)
        )}
        aria-label='Feedback Actions'
      />
    );
    await user.click(screen.getByRole('button', { name: 'Feedback Actions' }));
    const menu = screen.getByRole('menu');
    await expectNoA11yViolations(menu);
    await user.click(
      screen.getByRole('menuitem', { name: /Copy As Markdown/ })
    );
    expect(h.onCopyAsMarkdown).toHaveBeenCalledExactlyOnceWith(pendingItem);
    expect(h.onDismiss).not.toHaveBeenCalled();
  });

  it('renders a disabled dismiss while pending, axe-clean in RTL', async () => {
    const user = userEvent.setup();
    const h = handlers(['fb_1']);
    const { container } = render(
      <div dir='rtl'>
        <CommonDropdown
          variant='dropdown'
          size='compact'
          dir='rtl'
          items={feedbackActionsToDropdownItems(
            buildFeedbackActions(pendingItem, h)
          )}
          aria-label='Feedback Actions'
        />
      </div>
    );
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole('button', { name: 'Feedback Actions' }));
    expect(screen.getByRole('menuitem', { name: /Dismiss/ })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    await expectNoA11yViolations(screen.getByRole('menu'));
  });
});
