import { describe, expect, it } from 'vitest';
import {
  DEPTH_VAR,
  guardNested,
  nestedPreflightMessage,
  withPreflightDepth,
} from '../preflight-depth.mjs';

describe('preflight recursion guard', () => {
  it('allows a top-level run and marks children as nested', () => {
    expect(nestedPreflightMessage('x', {})).toBeNull();
    expect(guardNested('x', {}, () => {})).toBeNull();
    expect(withPreflightDepth({})[DEPTH_VAR]).toBe('1');
  });

  it('refuses when the sentinel is already set', () => {
    const lines = [];
    const code = guardNested('preflight:changed', { [DEPTH_VAR]: '1' }, m =>
      lines.push(m)
    );
    expect(code).toBe(1);
    expect(lines[0]).toContain('nested preflight');
  });

  it('a child env from a preflight makes the next entrypoint refuse', () => {
    const child = withPreflightDepth({});
    expect(guardNested('preflight', child, () => {})).toBe(1);
  });
});
