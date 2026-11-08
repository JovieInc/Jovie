import { vi } from 'vitest';
import {
  HOME_LOOP_FIXTURE_ASKS,
  HOME_LOOP_FIXTURE_COPY,
  HOME_LOOP_FIXTURE_DONE,
  HOME_LOOP_FIXTURE_PULSE,
  HOME_LOOP_FIXTURE_ROWS,
  HOME_LOOP_FIXTURE_STAGES,
} from './fixtures';
import type { HomeLoopCanvasProps } from './HomeLoopCanvas';

export function props(
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
