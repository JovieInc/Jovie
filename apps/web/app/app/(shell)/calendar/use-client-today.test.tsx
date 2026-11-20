import { renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { localTodayMs, useClientTodayMs } from './use-client-today';

function TodayProbe() {
  const today = useClientTodayMs();
  return <span>{today === null ? 'unmarked' : 'marked'}</span>;
}

describe('useClientTodayMs', () => {
  it('marks no day in the server render, so hydration cannot disagree', () => {
    expect(renderToString(<TodayProbe />)).toContain('unmarked');
  });

  it("returns the viewer's local midnight in the browser", () => {
    const { result } = renderHook(() => useClientTodayMs());
    expect(result.current).toBe(localTodayMs());
  });

  it('normalises any time of day to that local midnight', () => {
    const late = new Date(2026, 10, 30, 23, 59, 59);
    expect(localTodayMs(late)).toBe(new Date(2026, 10, 30).getTime());
  });
});
