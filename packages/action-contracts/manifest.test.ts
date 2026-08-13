import { describe, expect, it } from 'vitest';

import { ACTION_EFFECTS } from './descriptor';
import { ACTION_ERROR_CODES, actionErrorSchema } from './errors';
import { ACTION_IDS, assertActionIdFormat } from './ids';
import {
  ACTION_CHANNELS,
  ACTION_RESULT_STATUSES,
  actionInvocationSchema,
  actionResultSchema,
} from './invocation';
import { ACTION_MANIFEST, buildDiscoveryDocument } from './manifest';

const UUID = '123e4567-e89b-42d3-a456-426614174000';

const VALID_INVOCATION_BASE = {
  schemaVersion: 1,
  idempotencyKey: 'test-key-0001',
  context: { profileId: UUID, channel: 'web' },
};

const VALID_INPUTS: Record<string, unknown> = {
  'chat.start': {},
  'contact.create': { role: 'management', email: 'manager@example.com' },
  'release.create': { title: 'New Single', releaseType: 'single' },
  'task.create': { title: 'Follow up with venue' },
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
});

describe('canonical descriptor shape', () => {
  it('every descriptor carries the approved fields', () => {
    for (const action of ACTION_MANIFEST) {
      expect(Number.isInteger(action.schemaVersion)).toBe(true);
      expect(action.schemaVersion).toBeGreaterThanOrEqual(1);
      expect(action.titleKey).toMatch(/^actions\.[a-z.]+$/);
      expect(action.descriptionKey).toMatch(/^actions\.[a-z.]+$/);
      expect(ACTION_EFFECTS).toContain(action.effect);
      expect(['none', 'required']).toContain(action.confirmation);
      expect(action.supportedChannels.length).toBeGreaterThan(0);
      for (const channel of action.supportedChannels) {
        expect(ACTION_CHANNELS).toContain(channel);
      }
    }
  });

  it('descriptors contain no routes, prose, or client-trusted plan data', () => {
    for (const action of ACTION_MANIFEST) {
      const serialized = JSON.stringify({
        titleKey: action.titleKey,
        descriptionKey: action.descriptionKey,
        requirements: action.requirements,
      });
      expect(serialized).not.toMatch(/\/app\//);
      expect(serialized).not.toMatch(/https?:/);
    }
  });

  it('every action requires auth and profile ownership', () => {
    for (const action of ACTION_MANIFEST) {
      const types = action.requirements.map(r => r.type);
      expect(types).toContain('auth');
      expect(types).toContain('profile_ownership');
    }
  });

  it('entitlement requirements reference registry keys by name only', () => {
    for (const action of ACTION_MANIFEST) {
      for (const requirement of action.requirements) {
        if (requirement.type === 'entitlement') {
          expect(requirement.key).toMatch(/^[a-z][a-zA-Z0-9]*$/);
        }
      }
    }
  });

  it('chat.start is a navigation handoff with no required input', () => {
    const chatStart = ACTION_MANIFEST.find(a => a.id === 'chat.start');
    expect(chatStart?.effect).toBe('navigation');
    expect(chatStart?.confirmation).toBe('none');
    expect(chatStart?.inputSchema.safeParse({}).success).toBe(true);
  });

  it('write actions declare internal_write effect', () => {
    for (const id of ['contact.create', 'release.create', 'task.create']) {
      const action = ACTION_MANIFEST.find(a => a.id === id);
      expect(action?.effect).toBe('internal_write');
    }
  });
});

describe('stable error vocabulary', () => {
  it('matches the approved vocabulary exactly', () => {
    expect([...ACTION_ERROR_CODES]).toEqual([
      'AUTH_REQUIRED',
      'PROFILE_REQUIRED',
      'FORBIDDEN',
      'ENTITLEMENT_REQUIRED',
      'ENTITLEMENT_UNVERIFIED',
      'QUOTA_EXHAUSTED',
      'FEATURE_DISABLED',
      'PROVIDER_UNAVAILABLE',
      'CLIENT_UPGRADE_REQUIRED',
      'VALIDATION_FAILED',
      'REQUIRES_INPUT',
      'CONFIRMATION_REQUIRED',
      'CONFLICT',
      'IN_PROGRESS',
      'RATE_LIMITED',
      'TEMPORARILY_UNAVAILABLE',
      'INTERNAL',
    ]);
  });

  it('error schema requires code, messageKey, and retryable', () => {
    expect(
      actionErrorSchema.safeParse({
        code: 'ENTITLEMENT_REQUIRED',
        messageKey: 'errors.entitlementRequired',
        retryable: false,
      }).success
    ).toBe(true);
    expect(
      actionErrorSchema.safeParse({
        code: 'NOT_A_CODE',
        messageKey: 'x',
        retryable: false,
      }).success
    ).toBe(false);
    expect(
      actionErrorSchema.safeParse({ code: 'INTERNAL', retryable: true }).success
    ).toBe(false);
    expect(
      actionErrorSchema.safeParse({
        code: 'INTERNAL',
        messageKey: 'errors.internal',
      }).success
    ).toBe(false);
  });
});

describe('invocation envelope', () => {
  it('context owns profileId, channel, and clientVersion', () => {
    for (const action of ACTION_MANIFEST) {
      const invocation = actionInvocationSchema(action.inputSchema);
      const valid = invocation.safeParse({
        ...VALID_INVOCATION_BASE,
        input: VALID_INPUTS[action.id],
      });
      expect(valid.success).toBe(true);
    }
  });

  it('rejects invocations missing idempotencyKey or context.profileId', () => {
    for (const action of ACTION_MANIFEST) {
      const invocation = actionInvocationSchema(action.inputSchema);
      const input = VALID_INPUTS[action.id];
      const { idempotencyKey: _k, ...noKey } = VALID_INVOCATION_BASE;
      expect(invocation.safeParse({ ...noKey, input }).success).toBe(false);
      expect(
        invocation.safeParse({
          ...VALID_INVOCATION_BASE,
          context: { channel: 'web' },
          input,
        }).success
      ).toBe(false);
    }
  });

  it('domain inputs never duplicate invocation context fields', () => {
    for (const action of ACTION_MANIFEST) {
      const parsed = action.inputSchema.safeParse({
        ...(VALID_INPUTS[action.id] as Record<string, unknown>),
        profileId: UUID,
        idempotencyKey: 'test-key-0001',
        channel: 'web',
        clientVersion: '1.0.0',
      });
      if (parsed.success) {
        const data = parsed.data as Record<string, unknown>;
        expect(data).not.toHaveProperty('profileId');
        expect(data).not.toHaveProperty('idempotencyKey');
        expect(data).not.toHaveProperty('channel');
        expect(data).not.toHaveProperty('clientVersion');
      }
    }
  });
});

describe('result union', () => {
  const receipt = {
    executionId: UUID,
    requestId: 'req-1',
    actionId: 'task.create',
    schemaVersion: 1,
    channel: 'web',
    status: 'completed',
    startedAt: '2026-08-13T12:00:00.000Z',
  };

  it('parses every approved status', () => {
    const task = ACTION_MANIFEST.find(a => a.id === 'task.create');
    const result = actionResultSchema(task!.outputSchema);
    const error = {
      code: 'ENTITLEMENT_REQUIRED',
      messageKey: 'errors.entitlementRequired',
      retryable: false,
    };
    const cases: unknown[] = [
      {
        status: 'completed',
        receipt,
        data: { taskId: UUID, taskNumber: 7, title: 't' },
      },
      {
        status: 'handoff',
        receipt: { ...receipt, status: 'handoff' },
        handoff: { target: 'chat.new' },
      },
      {
        status: 'requires_input',
        receipt: { ...receipt, status: 'requires_input' },
        missingFields: ['title'],
      },
      {
        status: 'in_progress',
        receipt: { ...receipt, status: 'in_progress' },
        retryAfterMs: 500,
      },
      {
        status: 'unavailable',
        receipt: { ...receipt, status: 'unavailable' },
        error,
      },
      {
        status: 'failed',
        receipt: { ...receipt, status: 'failed' },
        error,
      },
    ];
    for (const value of cases) {
      expect(result.safeParse(value).success).toBe(true);
    }
    expect(ACTION_RESULT_STATUSES).toHaveLength(6);
  });

  it('rejects unknown statuses and malformed receipts', () => {
    const task = ACTION_MANIFEST.find(a => a.id === 'task.create');
    const result = actionResultSchema(task!.outputSchema);
    expect(result.safeParse({ status: 'ok', receipt }).success).toBe(false);
    expect(result.safeParse({ status: 'completed', data: {} }).success).toBe(
      false
    );
  });
});

describe('discovery document', () => {
  it('exposes the complete channel and error vocabulary', () => {
    const doc = buildDiscoveryDocument();
    expect(doc.channels).toEqual(ACTION_CHANNELS);
    expect(doc.errorCodes).toEqual(ACTION_ERROR_CODES);
    expect(doc.actions.map(a => a.id)).toEqual([...ACTION_IDS]);
  });

  it('carries the approved descriptor fields per action', () => {
    const doc = buildDiscoveryDocument();
    for (const action of doc.actions) {
      expect(action.schemaVersion).toBeGreaterThanOrEqual(1);
      expect(action.titleKey.length).toBeGreaterThan(0);
      expect(action.descriptionKey.length).toBeGreaterThan(0);
      expect(action.supportedChannels.length).toBeGreaterThan(0);
      expect(action.schemas.input).toBe(`schemas/${action.id}.input.json`);
    }
  });

  it('is JSON-serializable and stable', () => {
    expect(JSON.stringify(buildDiscoveryDocument())).toBe(
      JSON.stringify(buildDiscoveryDocument())
    );
  });
});
