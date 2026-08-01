import { describe, expect, it, vi } from 'vitest';
import {
  buildFeedbackActions,
  feedbackActionsToContextMenuItems,
  feedbackActionsToDropdownItems,
} from '@/components/features/admin/feedback-table/feedback-actions';

const feedback = {
  id: 'feedback_1',
  status: 'pending' as const,
};

function buildActions(
  status: 'pending' | 'dismissed' = 'pending',
  isDismissPending = false
) {
  const onCopyAsMarkdown = vi.fn();
  const onDismiss = vi.fn();
  const item = { ...feedback, status };
  const actions = buildFeedbackActions(item, {
    onCopyAsMarkdown,
    onDismiss,
    isDismissPending: () => isDismissPending,
  });

  return { actions, item, onCopyAsMarkdown, onDismiss };
}

describe('feedback action registry', () => {
  it('keeps the table context menu, rail context menu, and header overflow in parity', () => {
    const { actions } = buildActions();
    const contextItems = feedbackActionsToContextMenuItems(actions);
    const dropdownItems = feedbackActionsToDropdownItems(actions);

    expect(actions.map(action => action.id)).toEqual([
      'copy-feedback-markdown',
      'dismiss-feedback',
    ]);
    expect(
      contextItems
        .flatMap(item => ('id' in item ? [item.id] : []))
        .filter(id => !id.startsWith('feedback-action-separator'))
    ).toEqual(actions.map(action => action.id));
    expect(
      dropdownItems.flatMap(item => (item.type === 'action' ? [item.id] : []))
    ).toEqual(actions.map(action => action.id));
  });

  it('routes all action surfaces through the same callbacks', () => {
    const { actions, item, onCopyAsMarkdown, onDismiss } = buildActions();

    actions[0].onClick?.();
    actions[1].onClick?.();

    expect(onCopyAsMarkdown).toHaveBeenCalledWith(item);
    expect(onDismiss).toHaveBeenCalledWith(item);
  });

  it('disables dismiss in every surface after dismissal or while pending', () => {
    for (const { status, pending } of [
      { status: 'dismissed' as const, pending: false },
      { status: 'pending' as const, pending: true },
    ]) {
      const { actions } = buildActions(status, pending);
      const contextDismiss = feedbackActionsToContextMenuItems(actions).find(
        item => 'id' in item && item.id === 'dismiss-feedback'
      );
      const dropdownDismiss = feedbackActionsToDropdownItems(actions).find(
        item => item.type === 'action' && item.id === 'dismiss-feedback'
      );

      expect(actions[1].disabled).toBe(true);
      expect('disabled' in contextDismiss! && contextDismiss.disabled).toBe(
        true
      );
      expect(dropdownDismiss?.disabled).toBe(true);
    }
  });
});
