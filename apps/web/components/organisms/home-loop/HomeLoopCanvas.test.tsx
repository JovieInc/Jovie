import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HOME_LOOP_FIXTURE_ASKS,
  HOME_LOOP_FIXTURE_COPY,
  HOME_LOOP_FIXTURE_DONE,
  HOME_LOOP_FIXTURE_PULSE,
  HOME_LOOP_FIXTURE_ROWS,
  HOME_LOOP_FIXTURE_STAGES,
} from './fixtures';
import { HomeLoopAsks } from './HomeLoopAsks';
import { HomeLoopCanvas, type HomeLoopCanvasProps } from './HomeLoopCanvas';
import { HomeLoopPulse } from './HomeLoopPulse';
import { HomeLoopSection } from './HomeLoopSection';
import { HomeLoopStageRows } from './HomeLoopStageRows';
import {
  HOME_LOOP_UNDO_WINDOW_MS,
  useUndoableAnswers,
} from './useUndoableAnswers';

const toastMock = vi.hoisted(() => vi.fn());
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
    expect(screen.getByRole('status')).toHaveTextContent('2 items are blocked');
    expect(screen.getAllByTestId(/^home-loop-tile-/)).toHaveLength(7);
    expect(screen.getByTestId('home-loop-tile-prod')).toHaveTextContent(
      'Was 060037d'
    );
    expect(
      screen.getByTestId('home-loop-asks-section-count')
    ).toHaveTextContent('2');
    expect(screen.getAllByTestId('home-loop-stage-row')).toHaveLength(6);
    expect(screen.getByTestId('home-loop-done')).toHaveTextContent('12 merges');
    for (const name of ['Blocked On You', 'In Flight', 'Done Today']) {
      expect(
        screen.getByRole('heading', { name: new RegExp(name) })
      ).toBeVisible();
      expect(
        screen.getByRole('region', { name: new RegExp(name) })
      ).toHaveAttribute('data-state', 'populated');
    }
  });

  it.each(['loading', 'error', 'ready'] as const)(
    'keeps all sections mounted when %s without data',
    status => {
      render(
        <HomeLoopCanvas
          {...props({
            loopStatus: status,
            asksStatus: status,
            pulse: [],
            asks: [],
            rows: [],
            done: [],
            doneSummary: null,
            constraint: null,
          })}
        />
      );
      expect(screen.getAllByRole('region')).toHaveLength(3);
      for (const section of screen.getAllByRole('region')) {
        expect(section).toHaveAttribute(
          'data-state',
          status === 'ready' ? 'empty' : status
        );
      }
      expect(screen.getAllByTestId('home-loop-tile-placeholder')).toHaveLength(
        7
      );
      if (status === 'ready')
        expect(screen.getByRole('status')).toHaveTextContent(
          'Nothing is blocking shipping'
        );
    }
  );
});

describe('Home loop components', () => {
  it('names stage progress and attention for assistive tech', () => {
    render(
      <HomeLoopStageRows
        stages={HOME_LOOP_FIXTURE_STAGES}
        rows={HOME_LOOP_FIXTURE_ROWS}
        maxRows={3}
      />
    );
    expect(screen.getAllByTestId('home-loop-stage-row')).toHaveLength(3);
    expect(
      screen.getByRole('list', { name: 'Stage 1 of 6: Investigating, Blocked' })
    ).toBeVisible();
    expect(screen.getByText('Blocked')).toBeVisible();
    expect(screen.getByText('3 more in flight')).toBeVisible();
  });

  it('reserves pulse tiles while loading or unavailable, then shows values', () => {
    const { rerender } = render(<HomeLoopPulse tiles={[]} loading />);
    expect(screen.getByTestId('home-loop-pulse')).toHaveAttribute(
      'aria-busy',
      'true'
    );
    expect(screen.getAllByTestId('home-loop-tile-placeholder')).toHaveLength(7);
    rerender(<HomeLoopPulse tiles={[]} />);
    expect(screen.getByTestId('home-loop-pulse')).toHaveAttribute(
      'aria-busy',
      'false'
    );
    expect(screen.getAllByTestId('home-loop-tile-placeholder')).toHaveLength(7);
    rerender(<HomeLoopPulse tiles={HOME_LOOP_FIXTURE_PULSE} />);
    expect(screen.queryByTestId('home-loop-tile-placeholder')).toBeNull();
    expect(screen.getByTestId('home-loop-tile-prod')).toHaveTextContent(
      'Was 060037d'
    );
  });

  it('shows the section state and retries a failed read', () => {
    const onRetry = vi.fn();
    const section = {
      title: 'In Flight',
      isEmpty: true,
      emptyLabel: 'No work in flight.',
      errorLabel: 'Shipping data could not load.',
      skeleton: 'Loading',
      testId: 'section',
      onRetry,
      children: 'Work',
    };
    const { rerender } = render(
      <HomeLoopSection {...section} status='loading' />
    );
    expect(screen.getByRole('region')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Loading')).toBeVisible();
    rerender(<HomeLoopSection {...section} status='error' />);
    expect(screen.getByRole('alert')).toHaveTextContent(section.errorLabel);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
    rerender(<HomeLoopSection {...section} status='ready' />);
    expect(screen.getByText(section.emptyLabel)).toBeVisible();
    expect(screen.queryByText('Work')).toBeNull();
  });

  it('answers in one click, trims replies and discloses evidence on request', () => {
    const args = props();
    render(<HomeLoopAsks {...args} />);
    const card = within(
      screen.getAllByTestId('home-loop-ask')[0] as HTMLElement
    );
    fireEvent.click(card.getByTestId('home-loop-ask-approve'));
    expect(args.onApprove).toHaveBeenCalledWith(args.asks[0]);
    const send = card.getByRole('button', { name: 'Send Reply' });
    expect(send).toBeDisabled();
    fireEvent.change(card.getByRole('textbox'), {
      target: { value: ' Only for production ' },
    });
    fireEvent.submit(send.closest('form') as HTMLFormElement);
    expect(args.onReply).toHaveBeenCalledWith(
      args.asks[0],
      'Only for production'
    );
    const toggle = card.getByRole('button', { name: 'Why' });
    const why = document.getElementById(
      toggle.getAttribute('aria-controls') ?? ''
    );
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(why).not.toBeVisible();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(why).toBeVisible();
  });

  it('caps the asks and links the rest', () => {
    const asks = Array.from({ length: 5 }, (_, index) => ({
      ...HOME_LOOP_FIXTURE_ASKS[0],
      id: `ask-${index}`,
    })) as HomeLoopCanvasProps['asks'];
    render(<HomeLoopAsks {...props({ asks })} moreHref='/app/ov/inbox' />);
    expect(screen.getAllByTestId('home-loop-ask')).toHaveLength(3);
    expect(
      screen.getByRole('link', { name: '2 more decisions' })
    ).toHaveAttribute('href', '/app/ov/inbox');
  });

  it('replaces controls with the answer and restores them on failure', () => {
    const answers = {
      'vercel-concurrency': { label: 'Approved', state: 'pending' as const },
    };
    const { rerender } = render(<HomeLoopCanvas {...props({ answers })} />);
    expect(screen.getAllByTestId('home-loop-ask')[0]).toHaveAttribute(
      'data-answer-state',
      'pending'
    );
    expect(screen.getAllByTestId('home-loop-ask-approve')).toHaveLength(1);
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
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Not recorded. Try again.'
    );
    expect(screen.getAllByTestId('home-loop-ask-approve')).toHaveLength(2);
    expect(
      screen.getByTestId('home-loop-asks-section-count')
    ).toHaveTextContent('2');
  });
});

describe('useUndoableAnswers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    toastMock.mockReset();
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
});
