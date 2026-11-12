import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOME_LOOP_FIXTURE_ASKS } from './fixtures';
import { HomeLoopAsks } from './HomeLoopAsks';
import { HomeLoopCanvas } from './HomeLoopCanvas';
import { props } from './HomeLoopCanvas.test-fixtures';
import {
  HOME_LOOP_UNDO_WINDOW_MS,
  useUndoableAnswers,
} from './useUndoableAnswers';

const toastMock = vi.hoisted(() =>
  Object.assign(vi.fn(), {
    dismiss: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  })
);
vi.mock('@/components/feedback', () => ({ toast: toastMock }));

describe('HomeLoopCanvas notices and details', () => {
  it('links a summarized asks notice and the constraint details', () => {
    render(
      <HomeLoopCanvas
        {...props({
          constraint: {
            tone: 'bad',
            text: 'Remediation alerts are not being acknowledged',
            detailsHref: '/app/ov/product',
          },
          asksNotice: '27 sources are unavailable or missing evidence.',
          asksNoticeHref: '/app/ov/inbox',
        })}
      />
    );
    expect(screen.getByTestId('home-loop-constraint-details')).toHaveAttribute(
      'href',
      '/app/ov/product'
    );
    expect(
      screen.getByTestId('home-loop-asks-section-notice-link')
    ).toHaveAttribute('href', '/app/ov/inbox');
  });
});

describe('home loop parts', () => {
  it('renders asks standalone with answers in place', () => {
    render(
      <HomeLoopAsks
        asks={HOME_LOOP_FIXTURE_ASKS}
        answers={{ 'lyb-review': { label: 'Approved', state: 'sent' } }}
        onApprove={vi.fn()}
        onReply={vi.fn()}
      />
    );
    const [, second] = screen.getAllByTestId('home-loop-ask');
    expect(second).toHaveAttribute('data-answer-state', 'sent');
  });
});

describe('HomeLoopAsks escalation', () => {
  it('badges how long a no-default decision has waited, by level', () => {
    render(
      <HomeLoopAsks
        asks={[
          {
            ...HOME_LOOP_FIXTURE_ASKS[0],
            id: 'late',
            escalation: { level: 2, waitingHours: 52 },
          },
          {
            ...HOME_LOOP_FIXTURE_ASKS[1],
            id: 'aging',
            escalation: { level: 1, waitingHours: 26 },
          },
          HOME_LOOP_FIXTURE_ASKS[0],
        ]}
        answers={{}}
        onApprove={vi.fn()}
        onReply={vi.fn()}
      />
    );
    const badges = screen.getAllByTestId('home-loop-ask-escalation');
    expect(badges.map(badge => badge.textContent)).toEqual([
      'Waiting 52h',
      'Waiting 26h',
    ]);
    expect(badges[0]).toHaveClass('text-error-text');
    expect(badges[1]).toHaveClass('text-warning-text');
  });
});

describe('HomeLoopAsks options', () => {
  it('replaces the primary action with the asker options', () => {
    const onApprove = vi.fn();
    const ask = {
      ...HOME_LOOP_FIXTURE_ASKS[0],
      options: ['Signed in', 'Restarted it myself'],
    };
    render(
      <HomeLoopAsks
        asks={[ask]}
        answers={{}}
        onApprove={onApprove}
        onReply={vi.fn()}
      />
    );
    expect(screen.queryByTestId('home-loop-ask-approve')).toBeNull();
    const options = screen.getAllByTestId('home-loop-ask-option');
    expect(options.map(option => option.textContent)).toEqual([
      'Signed in',
      'Restarted it myself',
    ]);
    fireEvent.click(options[1] as HTMLElement);
    expect(onApprove).toHaveBeenCalledWith(ask, 'Restarted it myself');
  });
});

describe('HomeLoopAsks defaults and feedback', () => {
  afterEach(() => vi.useRealTimers());

  it('shows the declared default with a live countdown', () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-22T07:00:00.000Z') });
    render(
      <HomeLoopAsks
        asks={HOME_LOOP_FIXTURE_ASKS}
        answers={{}}
        onApprove={vi.fn()}
        onReply={vi.fn()}
      />
    );
    expect(screen.getByTestId('home-loop-ask-default')).toHaveTextContent(
      'Approves by default — Enable it for project jovie only'
    );
    expect(screen.getByTestId('home-loop-ask-countdown')).toHaveTextContent(
      'in 5h'
    );
    act(() => {
      vi.advanceTimersByTime(4 * 60 * 60_000 + 60_000);
    });
    expect(screen.getByTestId('home-loop-ask-countdown')).toHaveTextContent(
      'in 59m'
    );
    // Asks without a default show no default line.
    expect(screen.getAllByTestId('home-loop-ask-default')).toHaveLength(1);
  });

  it('offers feedback on a decided ask and sends it', () => {
    const onFeedback = vi.fn();
    render(
      <HomeLoopAsks
        asks={HOME_LOOP_FIXTURE_ASKS}
        answers={{ 'vercel-concurrency': { label: 'Approved', state: 'sent' } }}
        onApprove={vi.fn()}
        onReply={vi.fn()}
        onFeedback={onFeedback}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add Feedback' }));
    fireEvent.change(screen.getByRole('textbox', { name: /Feedback:/ }), {
      target: { value: 'Too dark on iPhone SE' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send Feedback' }));
    expect(onFeedback).toHaveBeenCalledWith(
      HOME_LOOP_FIXTURE_ASKS[0],
      'Too dark on iPhone SE'
    );
    expect(screen.queryByRole('button', { name: 'Send Feedback' })).toBeNull();
  });
});

describe('HomeLoopAnswerPanel', () => {
  it('replaces the in-flight rows when generated UI updates them in place', () => {
    render(
      <HomeLoopCanvas
        {...props({ inFlightOverride: <p>Generated shipping card</p> })}
      />
    );
    expect(screen.getByText('Generated shipping card')).toBeVisible();
    expect(screen.queryByTestId('home-loop-stage-row')).toBeNull();
  });
});

describe('useUndoableAnswers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    toastMock.mockReset();
    toastMock.dismiss.mockReset();
    toastMock.error.mockReset();
    toastMock.success.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('commits after the undo window and reports success', async () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    const onCommitted = vi.fn();
    const { result } = renderHook(() => useUndoableAnswers({ onCommitted }));

    act(() => result.current.answer({ id: 'a', label: 'Approved', commit }));
    expect(result.current.answers.a).toEqual({
      label: 'Approved',
      state: 'pending',
    });
    expect(toastMock).toHaveBeenCalledWith(
      'Approved',
      expect.objectContaining({ duration: HOME_LOOP_UNDO_WINDOW_MS })
    );
    expect(commit).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(HOME_LOOP_UNDO_WINDOW_MS);
    });
    expect(commit).toHaveBeenCalledOnce();
    expect(result.current.answers.a).toEqual({
      label: 'Approved',
      state: 'sent',
    });
    expect(onCommitted).toHaveBeenCalledWith('a');
  });

  it('undo inside the window never sends', async () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useUndoableAnswers());

    act(() => result.current.answer({ id: 'a', label: 'Approved', commit }));
    const undo = toastMock.mock.calls[0]?.[1]?.action?.onClick as () => void;
    act(() => undo());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HOME_LOOP_UNDO_WINDOW_MS);
    });
    expect(commit).not.toHaveBeenCalled();
    expect(result.current.answers.a).toBeUndefined();
  });

  it('surfaces a failed commit and ignores duplicate clicks', async () => {
    const commit = vi
      .fn()
      .mockRejectedValue(new Error('Not recorded. Try again.'));
    const { result } = renderHook(() => useUndoableAnswers());

    act(() => {
      result.current.answer({ id: 'a', label: 'Approved', commit });
      result.current.answer({ id: 'a', label: 'Approved', commit });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HOME_LOOP_UNDO_WINDOW_MS);
    });
    expect(commit).toHaveBeenCalledOnce();
    expect(result.current.answers.a).toEqual({
      label: 'Not recorded. Try again.',
      state: 'failed',
    });
  });

  it('commits a pending answer when the hook unmounts during the undo window', async () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    const onCommitted = vi.fn();
    const { result, unmount } = renderHook(() =>
      useUndoableAnswers({ onCommitted })
    );

    act(() => result.current.answer({ id: 'a', label: 'Approved', commit }));
    expect(commit).not.toHaveBeenCalled();

    await act(async () => {
      unmount();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HOME_LOOP_UNDO_WINDOW_MS);
    });

    expect(commit).toHaveBeenCalledOnce();
    expect(toastMock.dismiss).toHaveBeenCalledWith('home-loop-answer-a');
    expect(toastMock.success).toHaveBeenCalledWith('Approved');
    expect(onCommitted).toHaveBeenCalledWith('a');
  });

  it('does not send an undone answer when the hook unmounts', async () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useUndoableAnswers());

    act(() => result.current.answer({ id: 'a', label: 'Approved', commit }));
    const undo = toastMock.mock.calls[0]?.[1]?.action?.onClick as () => void;
    act(() => undo());
    await act(async () => {
      unmount();
    });

    expect(commit).not.toHaveBeenCalled();
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it('reports a failed flush when unmount commits and the send fails', async () => {
    const commit = vi
      .fn()
      .mockRejectedValue(new Error('Not recorded. Try again.'));
    const onCommitted = vi.fn();
    const { result, unmount } = renderHook(() =>
      useUndoableAnswers({ onCommitted })
    );

    act(() => result.current.answer({ id: 'a', label: 'Approved', commit }));
    await act(async () => {
      unmount();
    });

    expect(commit).toHaveBeenCalledOnce();
    expect(onCommitted).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith('Not recorded. Try again.');
    expect(toastMock.success).not.toHaveBeenCalled();
  });
});

describe('HomeLoopCanvas answered ask dim (a11y AA floor)', () => {
  it('dims an answered ask card at opacity-80, never 0.70', () => {
    const askId = HOME_LOOP_FIXTURE_ASKS[0]!.id;
    render(
      <HomeLoopCanvas
        {...props({
          answers: { [askId]: { label: 'Approved', state: 'sent' } },
        })}
      />
    );
    const cards = screen.getAllByTestId('home-loop-ask');
    expect(cards).toHaveLength(HOME_LOOP_FIXTURE_ASKS.length);
    const card = cards.find(card =>
      within(card).queryByRole('heading', {
        name: HOME_LOOP_FIXTURE_ASKS[0]!.title,
      })
    );
    expect(card).toHaveClass('opacity-80');
    expect(card).not.toHaveClass('opacity-70');
    for (const openCard of cards.filter(candidate => candidate !== card)) {
      expect(openCard).toHaveAttribute('data-answer-state', 'open');
      expect(openCard).not.toHaveClass('opacity-80');
      expect(openCard).not.toHaveClass('opacity-70');
    }
  });
});
