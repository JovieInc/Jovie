import { describe, expect, it } from 'vitest';
import {
  assertPrimaryCheckoutFresh,
  dirtyPathsAreOnlyDetritus,
  isShipperCriticalPath,
} from '../../hermes/lib/shipper-checkout-guard.ts';

describe('shipper checkout guard', () => {
  it('treats shipper control-plane paths as critical', () => {
    expect(isShipperCriticalPath('scripts/hermes/jobs/codex-issue-shipper.ts')).toBe(
      true
    );
    expect(isShipperCriticalPath('DESIGN.md')).toBe(false);
  });

  it('allows detritus-only dirty trees for auto-recovery', () => {
    expect(dirtyPathsAreOnlyDetritus(' M DESIGN.md\n?? /tmp/foo.yml\n')).toBe(
      true
    );
    expect(
      dirtyPathsAreOnlyDetritus(
        ' M scripts/hermes/jobs/codex-issue-shipper.ts\n'
      )
    ).toBe(false);
  });

  it('passes when branch is main and HEAD matches origin/main', () => {
    const responses = {
      'git fetch': '',
      'git branch': 'main\n',
      'git rev-parse HEAD': 'abc123\n',
      'git rev-parse origin/main': 'abc123\n',
      'git status': '',
    };
    const run = args => {
      const key = `${args[0]} ${args[1] ?? ''} ${args[2] ?? ''}`.trim();
      if (key.startsWith('git fetch')) return responses['git fetch'];
      if (key.startsWith('git branch')) return responses['git branch'];
      if (key.includes('rev-parse HEAD')) return responses['git rev-parse HEAD'];
      if (key.includes('rev-parse origin/main')) {
        return responses['git rev-parse origin/main'];
      }
      if (key.startsWith('git status')) return responses['git status'];
      throw new Error(`unexpected git call: ${args.join(' ')}`);
    };

    const result = assertPrimaryCheckoutFresh(run, '/repo', { fetch: true });
    expect(result.ok).toBe(true);
    expect(result.recovered).toBe(false);
    expect(result.reasons).toEqual([]);
  });

  it('aborts when branch is not main', () => {
    const run = args => {
      const joined = args.join(' ');
      if (joined.includes('fetch')) return '';
      if (joined.includes('branch --show-current')) return 'codex/foo\n';
      if (joined.includes('rev-parse HEAD')) return 'abc123\n';
      if (joined.includes('rev-parse origin/main')) return 'def456\n';
      if (joined.includes('status --porcelain')) return '';
      throw new Error(`unexpected git call: ${joined}`);
    };

    const result = assertPrimaryCheckoutFresh(run, '/repo', {
      autoRecover: false,
    });
    expect(result.ok).toBe(false);
    expect(result.reasons.some(reason => reason.includes('branch'))).toBe(true);
  });

  it('auto-recovers detritus-only dirty trees on wrong branch', () => {
    let branch = 'codex/foo';
    let head = 'abc123';
    const originMain = 'def456';
    let porcelain = ' M DESIGN.md\n';
    const calls = [];

    const run = args => {
      calls.push(args.join(' '));
      const joined = args.join(' ');
      if (joined.includes('fetch')) return '';
      if (joined.includes('branch --show-current')) return `${branch}\n`;
      if (joined.includes('rev-parse HEAD')) return `${head}\n`;
      if (joined.includes('rev-parse origin/main')) return `${originMain}\n`;
      if (joined.includes('status --porcelain')) return porcelain;
      if (joined.includes('stash push')) {
        porcelain = '';
        return '';
      }
      if (joined.includes('checkout main')) {
        branch = 'main';
        return '';
      }
      if (joined.includes('reset --hard origin/main')) {
        branch = 'main';
        head = originMain;
        return '';
      }
      throw new Error(`unexpected git call: ${joined}`);
    };

    const result = assertPrimaryCheckoutFresh(run, '/repo', { autoRecover: true });
    expect(result.ok).toBe(true);
    expect(result.recovered).toBe(true);
    expect(calls.some(call => call.includes('stash push'))).toBe(true);
    expect(calls.some(call => call.includes('reset --hard origin/main'))).toBe(
      true
    );
  });
});