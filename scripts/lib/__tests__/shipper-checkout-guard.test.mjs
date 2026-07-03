import { describe, expect, it } from 'vitest';
import {
  assertPrimaryCheckoutFresh,
  dirtyPathsAreOnlyDetritus,
  isShipperCriticalPath,
} from '../../hermes/lib/shipper-checkout-guard.ts';

function gitMock(state) {
  return args => {
    const joined = args.join(' ');
    if (joined.includes('fetch')) return '';
    if (joined.includes('branch --show-current')) return `${state.branch ?? 'main'}\n`;
    if (joined.includes('rev-parse HEAD')) return `${state.head ?? 'abc'}\n`;
    if (joined.includes('rev-parse origin/main')) return `${state.originMain ?? 'abc'}\n`;
    if (joined.includes('status --porcelain')) return state.porcelain ?? '';
    if (joined.includes('stash push')) {
      state.porcelain = '';
      return '';
    }
    if (joined.includes('checkout main')) {
      state.branch = 'main';
      return '';
    }
    if (joined.includes('reset --hard origin/main')) {
      state.branch = 'main';
      state.head = state.originMain ?? 'abc';
      return '';
    }
    throw new Error(`unexpected git call: ${joined}`);
  };
}

describe('shipper checkout guard', () => {
  it('flags shipper control-plane paths and detritus-only dirty trees', () => {
    expect(isShipperCriticalPath('scripts/hermes/jobs/codex-issue-shipper.ts')).toBe(true);
    expect(isShipperCriticalPath('DESIGN.md')).toBe(false);
    expect(dirtyPathsAreOnlyDetritus(' M DESIGN.md\n?? /tmp/foo.yml\n')).toBe(true);
    expect(dirtyPathsAreOnlyDetritus(' M scripts/hermes/jobs/codex-issue-shipper.ts\n')).toBe(
      false
    );
  });

  it('passes on main when HEAD matches origin/main', () => {
    const result = assertPrimaryCheckoutFresh(gitMock({}), '/repo', { fetch: true });
    expect(result).toMatchObject({ ok: true, recovered: false, reasons: [] });
  });

  it('aborts when branch is not main', () => {
    const result = assertPrimaryCheckoutFresh(gitMock({ branch: 'codex/foo', head: 'abc', originMain: 'def' }), '/repo', {
      autoRecover: false,
    });
    expect(result.ok).toBe(false);
    expect(result.reasons.some(reason => reason.includes('branch'))).toBe(true);
  });

  it('auto-recovers detritus-only dirty trees on wrong branch', () => {
    const state = { branch: 'codex/foo', head: 'abc', originMain: 'def', porcelain: ' M DESIGN.md\n' };
    const run = gitMock(state);
    const calls = [];
    const wrapped = args => {
      calls.push(args.join(' '));
      return run(args);
    };
    const result = assertPrimaryCheckoutFresh(wrapped, '/repo', { autoRecover: true });
    expect(result.ok).toBe(true);
    expect(result.recovered).toBe(true);
    expect(calls.some(call => call.includes('reset --hard origin/main'))).toBe(true);
  });
});