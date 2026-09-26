import { describe, expect, it, vi } from 'vitest';
import {
  PLACEHOLDER_IDENTITY_HANDLES,
  type PlaceholderProfileRow,
  parseArgs,
  planPlaceholderUnpublish,
  runPlaceholderUnpublish,
} from './unpublish-placeholder-identities';

function row(overrides: Partial<PlaceholderProfileRow>): PlaceholderProfileRow {
  return {
    id: 'id',
    username: 'user',
    usernameNormalized: 'user',
    displayName: 'user',
    isPublic: true,
    isClaimed: true,
    ...overrides,
  };
}

function deps(overrides: {
  rows?: readonly PlaceholderProfileRow[];
  candidates?: readonly {
    username: string;
    usernameNormalized: string;
    displayName: string | null;
  }[];
}) {
  const log = vi.fn();
  return {
    loadRows: vi.fn(async (handles: readonly string[]) =>
      (overrides.rows ?? []).filter(r => handles.includes(r.usernameNormalized))
    ),
    unpublish: vi.fn(async () => undefined),
    loadCandidates: vi.fn(async () => overrides.candidates ?? []),
    log,
    get messages() {
      return log.mock.calls.map(([message]) => message);
    },
  };
}

describe('unpublish-placeholder-identities', () => {
  it('covers the confirmed JOV-6464 leftover handles', () => {
    expect(PLACEHOLDER_IDENTITY_HANDLES).toEqual([
      'hello',
      'ti89m',
      'tim1',
      'timwhite1',
    ]);
  });

  it('unpublishes only claimed public rows in the allowlist', () => {
    const target = row({
      id: 'a',
      username: 'timwhite1',
      usernameNormalized: 'timwhite1',
      displayName: 'timwhite',
    });
    const alreadyPrivate = row({
      id: 'b',
      username: 'hello',
      usernameNormalized: 'hello',
      isPublic: false,
    });
    const unclaimed = row({
      id: 'c',
      username: 'ti89m',
      usernameNormalized: 'ti89m',
      isClaimed: false,
    });
    const notTargeted = row({
      id: 'd',
      username: 'realartist',
      usernameNormalized: 'realartist',
    });

    const plan = planPlaceholderUnpublish(
      [target, alreadyPrivate, unclaimed, notTargeted],
      [...PLACEHOLDER_IDENTITY_HANDLES]
    );

    expect(plan.unpublish.map(r => r.id)).toEqual(['a']);
    expect(plan.alreadyPrivate.map(r => r.id)).toEqual(['b']);
    expect(plan.unclaimed.map(r => r.id)).toEqual(['c']);
    expect(plan.missingHandles).toEqual(['tim1']);
  });

  it('treats null isPublic/isClaimed as not eligible', () => {
    const legacy = row({ id: 'a', isPublic: null, isClaimed: null });
    const plan = planPlaceholderUnpublish([legacy], ['user']);
    expect(plan.unpublish).toHaveLength(0);
    expect(plan.unclaimed.map(r => r.id)).toEqual(['a']);
  });
});

describe('parseArgs', () => {
  it('defaults to dry-run with only the built-in allowlist', () => {
    const options = parseArgs([]);
    expect(options.execute).toBe(false);
    expect(options.handles).toEqual([...PLACEHOLDER_IDENTITY_HANDLES]);
  });

  it('parses --execute and extra handles, lowercased and deduped', () => {
    const options = parseArgs([
      '--execute',
      '--handle= Extra ',
      '--handle=timwhite1',
      '--handle=',
      '--unknown-flag',
    ]);
    expect(options.execute).toBe(true);
    expect(options.handles).toEqual([...PLACEHOLDER_IDENTITY_HANDLES, 'extra']);
  });
});

describe('runPlaceholderUnpublish', () => {
  it('dry-run reports the plan, skips mutation, and lists remaining candidates', async () => {
    const target = row({
      id: 'a',
      username: 'timwhite1',
      usernameNormalized: 'timwhite1',
      displayName: 'timwhite',
    });
    const alreadyPrivate = row({
      id: 'b',
      username: 'hello',
      usernameNormalized: 'hello',
      isPublic: false,
    });
    const unclaimed = row({
      id: 'c',
      username: 'ti89m',
      usernameNormalized: 'ti89m',
      isClaimed: false,
    });
    const d = deps({
      rows: [target, alreadyPrivate, unclaimed],
      candidates: [
        {
          username: 'timwhite1',
          usernameNormalized: 'timwhite1',
          displayName: 'timwhite',
        },
        {
          username: 'other',
          usernameNormalized: 'other',
          displayName: null,
        },
      ],
    });

    const plan = await runPlaceholderUnpublish(
      { execute: false, handles: [...PLACEHOLDER_IDENTITY_HANDLES] },
      d
    );

    expect(d.unpublish).not.toHaveBeenCalled();
    expect(plan.unpublish.map(r => r.id)).toEqual(['a']);
    const messages = d.messages.join('\n');
    expect(messages).toContain(
      'UNPUBLISH @timwhite1 (a, displayName=timwhite)'
    );
    expect(messages).toContain('SKIP already private @hello (b)');
    expect(messages).toContain('SKIP unclaimed @ti89m (c)');
    expect(messages).toContain('MISS no profile row for handle "tim1"');
    expect(messages).toContain('No rows updated (dry-run).');
    expect(messages).toContain(
      'Other claimed public placeholder-shaped identities'
    );
    expect(messages).toContain('@other (displayName=null)');
    // The row being unpublished is not re-reported as a remaining candidate.
    expect(messages).not.toContain('@timwhite1 (displayName=timwhite) — rerun');
  });

  it('execute unpublishes matched ids and prints the count', async () => {
    const target = row({
      id: 'a',
      username: 'timwhite1',
      usernameNormalized: 'timwhite1',
      displayName: null,
    });
    const d = deps({ rows: [target] });

    await runPlaceholderUnpublish(
      { execute: true, handles: [...PLACEHOLDER_IDENTITY_HANDLES] },
      d
    );

    expect(d.unpublish).toHaveBeenCalledWith(['a']);
    expect(d.messages.join('\n')).toContain('Unpublished 1 profile(s).');
    expect(d.messages.join('\n')).toContain('displayName=null');
  });

  it('execute with nothing to unpublish does not touch the database', async () => {
    const d = deps({ rows: [] });
    await runPlaceholderUnpublish(
      { execute: true, handles: [...PLACEHOLDER_IDENTITY_HANDLES] },
      d
    );
    expect(d.unpublish).not.toHaveBeenCalled();
    expect(d.messages.join('\n')).not.toContain('Unpublished');
    expect(d.messages.join('\n')).not.toContain(
      'Other claimed public placeholder-shaped'
    );
  });
});
