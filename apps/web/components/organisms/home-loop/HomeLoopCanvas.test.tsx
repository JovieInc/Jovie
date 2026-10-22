import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockFitLayout } from './fit-layout.test-utils';
import {
  HOME_LOOP_FIXTURE_ASKS,
  HOME_LOOP_FIXTURE_COPY,
  HOME_LOOP_FIXTURE_DONE,
  HOME_LOOP_FIXTURE_PULSE,
  HOME_LOOP_FIXTURE_ROWS,
  HOME_LOOP_FIXTURE_STAGES,
} from './fixtures';
import { HomeLoopAnswerPanel } from './HomeLoopAnswerPanel';
import { HomeLoopAsks } from './HomeLoopAsks';
import { HomeLoopCanvas, type HomeLoopCanvasProps } from './HomeLoopCanvas';
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

function props(
  overrides: Partial<HomeLoopCanvasProps> = {}
): HomeLoopCanvasProps {
  return {
    copy: HOME_LOOP_FIXTURE_COPY,
    stages: HOME_LOOP_FIXTURE_STAGES,
    constraint: { tone: 'bad', text: '2 items are blocked' },
    pulse: HOME_LOOP_FIXTURE_PULSE,
    asks: HOME_LOOP_FIXTURE_ASKS,
    rows: HOME_LOOP_FIXTURE_ROWS,
    done: HOME_LOOP_FIXTURE_DONE,
    doneSummary: '12 merges',
    loopStatus: 'ready',
    asksStatus: 'ready',
    answers: {},
    onApprove: vi.fn(),
    onReply: vi.fn(),
    onRetryLoop: vi.fn(),
    onRetryAsks: vi.fn(),
    ...overrides,
  };
}

describe('HomeLoopCanvas', () => {
  it('renders every section populated with named headings and counts', () => {
    render(<HomeLoopCanvas {...props()} />);

    expect(screen.getByTestId('home-loop-constraint')).toHaveTextContent(
      '2 items are blocked'
    );
    expect(screen.getAllByTestId(/^home-loop-tile-/)).toHaveLength(7);
    expect(screen.getByTestId('home-loop-tile-prod')).toHaveTextContent(
      'Was 060037d'
    );
    expect(
      screen.getByRole('heading', { name: /Blocked On You/ })
    ).toBeVisible();
    expect(
      screen.getByTestId('home-loop-asks-section-count')
    ).toHaveTextContent('2');
    expect(screen.getAllByTestId('home-loop-kanban-card')).toHaveLength(6);
    expect(screen.getAllByTestId('home-loop-kanban-lane')).toHaveLength(6);
    expect(screen.getByTestId('home-loop-done')).toHaveTextContent('12 merges');
    for (const id of [
      'home-loop-asks-section',
      'home-loop-in-flight-section',
      'home-loop-done-section',
    ])
      expect(screen.getByTestId(id)).toHaveAttribute('data-state', 'populated');
  });

  it('names stage progress and attention for assistive tech, not color alone', () => {
    render(<HomeLoopCanvas {...props()} />);
    const [blocked] = screen.getAllByTestId('home-loop-kanban-card');
    expect(blocked).toHaveAttribute('data-attention', 'blocked');
    expect(blocked).toHaveTextContent('Blocked');
    expect(
      screen.getByRole('region', { name: 'Investigating: 1' })
    ).toContainElement(blocked as HTMLElement);
  });

  it('keeps one frame per section across loading, error, and empty states', () => {
    const { rerender } = render(
      <HomeLoopCanvas
        {...props({ loopStatus: 'loading', asksStatus: 'loading', pulse: [] })}
      />
    );
    expect(screen.getAllByTestId('home-loop-tile-placeholder')).toHaveLength(7);
    expect(screen.getByTestId('home-loop-constraint')).toHaveAttribute(
      'data-tone',
      'loading'
    );
    expect(screen.getByTestId('home-loop-in-flight-section')).toHaveAttribute(
      'aria-busy',
      'true'
    );

    const onRetryLoop = vi.fn();
    rerender(
      <HomeLoopCanvas
        {...props({
          loopStatus: 'error',
          asksStatus: 'error',
          pulse: [],
          onRetryLoop,
        })}
      />
    );
    expect(screen.getByTestId('home-loop-in-flight-section')).toHaveAttribute(
      'data-state',
      'error'
    );
    // Unavailable tiles keep their frames so sections below never move.
    expect(screen.getAllByTestId('home-loop-tile-placeholder')).toHaveLength(7);
    fireEvent.click(
      within(screen.getByTestId('home-loop-in-flight-section')).getByRole(
        'button',
        {
          name: 'Try again',
        }
      )
    );
    expect(onRetryLoop).toHaveBeenCalledOnce();

    rerender(
      <HomeLoopCanvas
        {...props({
          constraint: null,
          asks: [],
          rows: [],
          done: [],
          doneSummary: null,
        })}
      />
    );
    expect(screen.getByTestId('home-loop-constraint')).toHaveTextContent(
      'Nothing is blocking shipping'
    );
    expect(screen.getByText('Nothing needs your decision.')).toBeVisible();
    expect(screen.getByText('No work in flight.')).toBeVisible();
    expect(screen.getByText('Nothing has landed yet today.')).toBeVisible();
  });

  it('answers in one click and sends a written reply', () => {
    const onApprove = vi.fn();
    const onReply = vi.fn();
    render(<HomeLoopCanvas {...props({ onApprove, onReply })} />);
    const [first] = screen.getAllByTestId('home-loop-ask');
    const card = within(first as HTMLElement);

    fireEvent.click(card.getByTestId('home-loop-ask-approve'));
    expect(onApprove).toHaveBeenCalledWith(HOME_LOOP_FIXTURE_ASKS[0]);

    const send = card.getByRole('button', { name: 'Send Reply' });
    expect(send).toBeDisabled();
    fireEvent.change(card.getByRole('textbox'), {
      target: { value: 'Only for production' },
    });
    fireEvent.submit(send.closest('form') as HTMLFormElement);
    expect(onReply).toHaveBeenCalledWith(
      HOME_LOOP_FIXTURE_ASKS[0],
      'Only for production'
    );
  });

  it('fits the asks to their space and links the rest', () => {
    const restore = mockFitLayout('home-loop-asks', 250);
    try {
      const many = Array.from({ length: 5 }, (_, index) => ({
        ...HOME_LOOP_FIXTURE_ASKS[0],
        id: `ask-${index}`,
      })) as HomeLoopCanvasProps['asks'];
      render(
        <HomeLoopCanvas
          {...props({ asks: many, asksMoreHref: '/app/ov/inbox' })}
        />
      );
      const visible = screen
        .getAllByTestId('home-loop-ask')
        .filter(card => card.style.visibility !== 'hidden');
      expect(visible).toHaveLength(2);
      expect(screen.getByTestId('home-loop-asks-more')).toHaveAttribute(
        'href',
        '/app/ov/inbox'
      );
      expect(screen.getByTestId('home-loop-asks-more')).toHaveTextContent(
        '+3 more decisions'
      );
    } finally {
      restore();
    }
  });

  it('keeps the why collapsed until requested', () => {
    render(<HomeLoopCanvas {...props()} />);
    const [first] = screen.getAllByTestId('home-loop-ask');
    const toggle = within(first as HTMLElement).getByRole('button', {
      name: 'Why',
    });
    const why = document.getElementById(
      toggle.getAttribute('aria-controls') ?? ''
    );
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(why).not.toBeVisible();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(why).toBeVisible();
  });

  it('replaces controls with the answer and restores them on failure', () => {
    const { rerender } = render(
      <HomeLoopCanvas
        {...props({
          answers: {
            'vercel-concurrency': { label: 'Approved', state: 'pending' },
          },
        })}
      />
    );
    const [first] = screen.getAllByTestId('home-loop-ask');
    expect(first).toHaveAttribute('data-answer-state', 'pending');
    expect(
      within(first as HTMLElement).queryByTestId('home-loop-ask-approve')
    ).toBeNull();
    expect(
      screen.getByTestId('home-loop-asks-section-count')
    ).toHaveTextContent('1');

    rerender(
      <HomeLoopCanvas
        {...props({
          answers: {
            'vercel-concurrency': {
              label: 'Not recorded. Try again.',
              state: 'failed',
            },
          },
        })}
      />
    );
    const [failed] = screen.getAllByTestId('home-loop-ask');
    expect(within(failed as HTMLElement).getByRole('alert')).toHaveTextContent(
      'Not recorded. Try again.'
    );
    expect(
      within(failed as HTMLElement).getByTestId('home-loop-ask-approve')
    ).toBeVisible();
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
    expect(badges[0]).toHaveClass('text-error');
    expect(badges[1]).toHaveClass('text-warning');
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
  it('bounds history navigation and exposes every control by name', () => {
    const handlers = {
      onBack: vi.fn(),
      onForward: vi.fn(),
      onHome: vi.fn(),
      onOpenTranscript: vi.fn(),
    };
    render(
      <HomeLoopAnswerPanel
        prompt='Status?'
        reply='All green.'
        pending={false}
        position={1}
        total={2}
        {...handlers}
      />
    );
    expect(
      screen.getByRole('button', { name: 'Previous Answer' })
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next Answer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Conversation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back To Home' }));
    expect(handlers.onForward).toHaveBeenCalledOnce();
    expect(handlers.onOpenTranscript).toHaveBeenCalledOnce();
    expect(handlers.onHome).toHaveBeenCalledOnce();
    expect(screen.getByTestId('home-loop-answer')).toHaveTextContent('1 of 2');
  });

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
