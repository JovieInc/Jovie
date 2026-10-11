import { describe, expect, it } from 'vitest';
import { isCreatorInboxSourceKind } from './creator-inbox-source-policy';

describe('creator inbox source provenance', () => {
  it.each([
    'founder.brain_dump',
    'FOUNDER.review',
    'ops.healthcheck',
    'ovie.queue',
    'workflow_capture.request',
  ])(
    'keeps explicit operator source %s outside the creator projection',
    kind => {
      expect(isCreatorInboxSourceKind(kind)).toBe(false);
    }
  );
  it.each([
    'calendar.create_event',
    'social_reply.draft',
    'healthcheck.legacy_customer',
    'creator.suggestion',
  ])(
    'retains creator or ambiguous legacy source %s without retagging',
    kind => {
      expect(isCreatorInboxSourceKind(kind)).toBe(true);
    }
  );
});
