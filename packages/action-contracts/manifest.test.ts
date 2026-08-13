import { describe, expect, it } from 'vitest';

import { COMMON_ERROR_CODES, isErrorCodeFormat } from './envelope';
import { ACTION_IDS, assertActionIdFormat } from './ids';
import { ACTION_MANIFEST, buildDiscoveryDocument } from './manifest';

const UUID = '123e4567-e89b-42d3-a456-426614174000';
const KEY = 'test-key-0001';

const VALID_INPUTS: Record<string, unknown> = {
  'chat.start': { profileId: UUID, idempotencyKey: KEY, source: 'web' },
  'contact.create': {
    profileId: UUID,
    idempotencyKey: KEY,
    channel: 'email',
    value: 'fan@example.com',
  },
  'release.create': {
    profileId: UUID,
    idempotencyKey: KEY,
    title: 'New Single',
    releaseType: 'single',
  },
  'task.create': {
    profileId: UUID,
    idempotencyKey: KEY,
    title: 'Follow up with venue',
  },
};

describe('action identity', () => {
  it('contains exactly the approved stable IDs, in order', () => {
    expect(ACTION_MANIFEST.map(action => action.id)).toEqual([...ACTION_IDS]);
  });

  it('has no duplicate action IDs', () => {
    const ids = ACTION_MANIFEST.map(action => action.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses <domain>.<verb> id format', () => {
    for (const id of ACTION_IDS) {
      expect(() => assertActionIdFormat(id)).not.toThrow();
    }
  });

  it('pins every action to version 1 as a mutation', () => {
    for (const action of ACTION_MANIFEST) {
      expect(action.version).toBe('1');
      expect(action.kind).toBe('mutation');
    }
  });
});

describe('contract metadata', () => {
  it('every action is authenticated and profile-scoped', () => {
    for (const action of ACTION_MANIFEST) {
      expect(action.auth.requiresAuth).toBe(true);
      expect(action.auth.profileScoped).toBe(true);
    }
  });

  it('no action is writable through the public per-artist MCP endpoint', () => {
    for (const action of ACTION_MANIFEST) {
      expect(action.auth.publicArtistMcpWritable).toBe(false);
    }
  });

  it('every action requires an idempotency key with replay semantics', () => {
    for (const action of ACTION_MANIFEST) {
      expect(action.idempotency.required).toBe(true);
      expect(action.idempotency.keyField).toBe('idempotencyKey');
      expect(['replay', 'conflict']).toContain(action.idempotency.onConflict);
    }
  });

  it('every action declares additive-only evolution rules', () => {
    for (const action of ACTION_MANIFEST) {
      expect(action.evolution.additiveOnly).toBe(true);
      expect(action.evolution.breakingChanges).toBe('new-action-version');
      expect(action.evolution.deprecation).toBe('successor-required');
    }
  });

  it('discovery metadata is complete and bindings are honestly labeled', () => {
    for (const action of ACTION_MANIFEST) {
      expect(action.discovery.title.length).toBeGreaterThan(0);
      expect(action.discovery.summary.length).toBeGreaterThan(0);
      expect(action.discovery.bindings.length).toBeGreaterThan(0);
      for (const binding of action.discovery.bindings) {
        expect(['existing', 'contract-only']).toContain(binding.status);
      }
    }
  });
});

describe('structured errors', () => {
  it('domain codes are SNAKE_CASE, unique per action, and not common codes', () => {
    const common = new Set<string>(COMMON_ERROR_CODES);
    for (const action of ACTION_MANIFEST) {
      expect(action.domainErrorCodes.length).toBeGreaterThan(0);
      const seen = new Set<string>();
      for (const code of action.domainErrorCodes) {
        expect(isErrorCodeFormat(code)).toBe(true);
        expect(common.has(code)).toBe(false);
        expect(seen.has(code)).toBe(false);
        seen.add(code);
      }
    }
  });

  it('every action error schema accepts its domain codes and rejects others', () => {
    for (const action of ACTION_MANIFEST) {
      for (const code of action.domainErrorCodes) {
        const parsed = action.error.safeParse({
          code,
          message: 'human readable',
          retryable: false,
        });
        expect(parsed.success).toBe(true);
      }
      const invalid = action.error.safeParse({
        code: 'NOT_A_DECLARED_CODE',
        message: 'x',
        retryable: false,
      });
      expect(invalid.success).toBe(false);
    }
  });

  it('errors without a code or retryable flag fail to parse', () => {
    for (const action of ACTION_MANIFEST) {
      expect(
        action.error.safeParse({ message: 'x', retryable: false }).success
      ).toBe(false);
      expect(
        action.error.safeParse({ code: 'INTERNAL_ERROR', message: 'x' }).success
      ).toBe(false);
    }
  });
});

describe('input schemas', () => {
  it('accepts a minimal valid input per action', () => {
    for (const action of ACTION_MANIFEST) {
      const input = VALID_INPUTS[action.id];
      const parsed = action.input.safeParse(input);
      expect(parsed.success).toBe(true);
    }
  });

  it('rejects inputs missing idempotencyKey or profileId', () => {
    for (const action of ACTION_MANIFEST) {
      const input = VALID_INPUTS[action.id] as Record<string, unknown>;
      const { idempotencyKey: _k, ...noKey } = input;
      expect(action.input.safeParse(noKey).success).toBe(false);
      const { profileId: _p, ...noProfile } = input;
      expect(action.input.safeParse(noProfile).success).toBe(false);
    }
  });
});

describe('discovery document', () => {
  it('is serializable and carries one entry per stable ID', () => {
    const doc = buildDiscoveryDocument();
    expect(doc.contractVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(doc.actions.map(a => a.id)).toEqual([...ACTION_IDS]);
    expect(() => JSON.stringify(doc)).not.toThrow();
  });

  it('declares the platform invariants machine-readably', () => {
    const doc = buildDiscoveryDocument();
    expect(doc.invariants).toEqual({
      dispatcherOwnsPolicy: true,
      ledgerRequiredBeforeWrites: true,
      publicArtistMcpWritable: false,
      clientsArePresentationOnly: true,
    });
  });
});
