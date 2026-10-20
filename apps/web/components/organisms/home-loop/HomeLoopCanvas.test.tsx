import { act, fireEvent, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HOME_LOOP_FIXTURE_ASKS as asks,
  HOME_LOOP_FIXTURE_PULSE as pulse,
  HOME_LOOP_FIXTURE_ROWS as rows,
  HOME_LOOP_FIXTURE_STAGES as stages,
} from './fixtures';
import { HomeLoopAsks } from './HomeLoopAsks';
import { HomeLoopCanvas, type HomeLoopCanvasProps } from './HomeLoopCanvas';
import canvasStory from './HomeLoopCanvas.stories';
import { HomeLoopPulse } from './HomeLoopPulse';
import { HomeLoopSection } from './HomeLoopSection';
import sectionStory from './HomeLoopSection.stories';
import { HomeLoopStageRows } from './HomeLoopStageRows';
import {
  HOME_LOOP_UNDO_WINDOW_MS,
  useUndoableAnswers,
} from './useUndoableAnswers';

const toastMock = vi.hoisted(() => vi.fn());
vi.mock('@/components/feedback', () => ({ toast: toastMock }));

function props(overrides: Partial<HomeLoopCanvasProps> = {}) {
  return {
    ...canvasStory.args,
    onApprove: vi.fn(),
    onReply: vi.fn(),
    ...overrides,
  };
}

describe('HomeLoopCanvas', () => {
  it('renders every section populated with named headings and counts', () => {
    const ui = render(<HomeLoopCanvas {...props()} />);
    expect(ui.getByRole('status')).toHaveTextContent(
      canvasStory.args.constraint.text
    );
    expect(ui.getAllByTestId(/^home-loop-tile-/)).toHaveLength(7);
    expect(ui.getByTestId('home-loop-tile-prod')).toHaveTextContent(
      'Was 060037d'
    );
    expect(ui.getByTestId('home-loop-asks-section-count')).toHaveTextContent(
      '2'
    );
    expect(ui.getAllByTestId('home-loop-stage-row')).toHaveLength(6);
    expect(ui.getByTestId('home-loop-done')).toHaveTextContent('12 merges');
    for (const name of ['Blocked On You', 'In Flight', 'Done Today']) {
      expect(ui.getByRole('heading', { name: new RegExp(name) })).toBeVisible();
      expect(
        ui.getByRole('region', { name: new RegExp(name) })
      ).toHaveAttribute('data-state', 'populated');
    }
  });

  it.each(['loading', 'error', 'ready'] as const)(
    'keeps all sections mounted when %s without data',
    status => {
      const ui = render(
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
      expect(ui.getAllByRole('region')).toHaveLength(3);
      for (const section of ui.getAllByRole('region')) {
        expect(section).toHaveAttribute(
          'data-state',
          status === 'ready' ? 'empty' : status
        );
      }
      expect(ui.getAllByTestId('home-loop-tile-placeholder')).toHaveLength(7);
      if (status === 'ready')
        expect(ui.getByRole('status')).toHaveTextContent(
          'Nothing is blocking shipping'
        );
    }
  );
});

describe('Home loop components', () => {
  it('names stage progress and attention for assistive tech', () => {
    const ui = render(
      <HomeLoopStageRows stages={stages} rows={rows} maxRows={3} />
    );
    expect(ui.getAllByTestId('home-loop-stage-row')).toHaveLength(3);
    expect(
      ui.getByRole('list', { name: 'Stage 1 of 6: Investigating, Blocked' })
    ).toBeVisible();
    expect(ui.getByText('Blocked')).toBeVisible();
    expect(ui.getByText('3 more in flight')).toBeVisible();
  });

  it('reserves pulse tiles while loading or unavailable, then shows values', () => {
    const ui = render(<HomeLoopPulse tiles={[]} loading />);
    const grid = ui.getByTestId('home-loop-pulse');
    expect(grid).toHaveAttribute('aria-busy', 'true');
    expect(ui.getAllByTestId('home-loop-tile-placeholder')).toHaveLength(7);
    ui.rerender(<HomeLoopPulse tiles={[]} />);
    expect(grid).toHaveAttribute('aria-busy', 'false');
    expect(ui.getAllByTestId('home-loop-tile-placeholder')).toHaveLength(7);
    ui.rerender(<HomeLoopPulse tiles={pulse} />);
    expect(ui.queryByTestId('home-loop-tile-placeholder')).toBeNull();
    expect(ui.getByTestId('home-loop-tile-prod')).toHaveTextContent(
      'Was 060037d'
    );
  });

  it('shows the section state and retries a failed read', () => {
    const onRetry = vi.fn();
    const section = { ...sectionStory.args, onRetry, children: 'Work' };
    const ui = render(<HomeLoopSection {...section} status='loading' />);
    expect(ui.getByRole('region')).toHaveAttribute('aria-busy', 'true');
    expect(ui.queryByText('Work')).toBeNull();
    ui.rerender(<HomeLoopSection {...section} status='error' />);
    expect(ui.getByRole('alert')).toHaveTextContent(section.errorLabel);
    fireEvent.click(ui.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
    ui.rerender(<HomeLoopSection {...section} status='ready' isEmpty />);
    expect(ui.getByText(section.emptyLabel)).toBeVisible();
    expect(ui.queryByText('Work')).toBeNull();
  });

  it('answers in one click, trims replies and discloses evidence on request', () => {
    const args = props({ asks: asks.slice(0, 1) });
    const ui = render(<HomeLoopAsks {...args} />);
    fireEvent.click(ui.getByTestId('home-loop-ask-approve'));
    expect(args.onApprove).toHaveBeenCalledWith(args.asks[0]);
    const send = ui.getByRole('button', { name: 'Send Reply' });
    expect(send).toBeDisabled();
    fireEvent.change(ui.getByRole('textbox'), {
      target: { value: ' Only for production ' },
    });
    fireEvent.submit(send.closest('form') as HTMLFormElement);
    expect(args.onReply).toHaveBeenCalledWith(
      args.asks[0],
      'Only for production'
    );
    const toggle = ui.getByRole('button', { name: 'Why' });
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
    const many = Array.from({ length: 5 }, (_, index) => ({
      ...asks[0],
      id: `ask-${index}`,
    })) as HomeLoopCanvasProps['asks'];
    const ui = render(
      <HomeLoopAsks {...props({ asks: many })} moreHref='/app/ov/inbox' />
    );
    expect(ui.getAllByTestId('home-loop-ask')).toHaveLength(3);
    const link = ui.getByRole('link', { name: '2 more decisions' });
    expect(link).toHaveAttribute('href', '/app/ov/inbox');
  });

  it('replaces controls with the answer and restores them on failure', () => {
    const answers = {
      'vercel-concurrency': { label: 'Approved', state: 'pending' as const },
    };
    const ui = render(<HomeLoopCanvas {...props({ answers })} />);
    const first = ui.getAllByTestId('home-loop-ask')[0];
    expect(first).toHaveAttribute('data-answer-state', 'pending');
    expect(ui.getAllByTestId('home-loop-ask-approve')).toHaveLength(1);
    const count = ui.getByTestId('home-loop-asks-section-count');
    expect(count).toHaveTextContent('1');
    const failure = {
      label: 'Not recorded. Try again.',
      state: 'failed' as const,
    };
    ui.rerender(
      <HomeLoopCanvas
        {...props({ answers: { 'vercel-concurrency': failure } })}
      />
    );
    expect(ui.getByRole('alert')).toHaveTextContent('Not recorded. Try again.');
    expect(ui.getAllByTestId('home-loop-ask-approve')).toHaveLength(2);
    expect(count).toHaveTextContent('2');
  });
});

describe('useUndoableAnswers', () => {
  const closeWindow = () =>
    act(() => vi.advanceTimersByTimeAsync(HOME_LOOP_UNDO_WINDOW_MS));

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
    const pending = { label: 'Approved', state: 'pending' as const };
    expect(result.current.answers.a).toEqual(pending);
    expect(toastMock).toHaveBeenCalledWith(
      'Approved',
      expect.objectContaining({ duration: HOME_LOOP_UNDO_WINDOW_MS })
    );
    expect(commit).not.toHaveBeenCalled();

    await closeWindow();
    expect(commit).toHaveBeenCalledOnce();
    expect(result.current.answers.a).toEqual({ ...pending, state: 'sent' });
    expect(onCommitted).toHaveBeenCalledWith('a');
  });

  it('undo inside the window never sends', async () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useUndoableAnswers());

    act(() => result.current.answer({ id: 'a', label: 'Approved', commit }));
    const undo = toastMock.mock.calls[0]?.[1]?.action?.onClick as () => void;
    act(() => undo());
    await closeWindow();
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
    await closeWindow();
    expect(commit).toHaveBeenCalledOnce();
    expect(result.current.answers.a).toEqual({
      label: 'Not recorded. Try again.',
      state: 'failed',
    });
  });
});
