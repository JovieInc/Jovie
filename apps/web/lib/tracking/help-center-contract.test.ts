import { describe, expect, it } from 'vitest';
import {
  HELP_CENTER_MAX_BATCH_SIZE,
  HELP_CENTER_SCHEMA_VERSION,
  helpCenterBatchSchema,
  helpCenterEventSchema,
} from './help-center-contract';

const BASE = {
  schema_version: HELP_CENTER_SCHEMA_VERSION,
  event_id: 'opaque-help-id-1234:article_viewed',
  event: 'article_viewed',
  article_id: 'features/tips',
  source_surface: 'article',
  referrer_class: 'external',
  signed_in: 'signed_out',
  viewport_class: 'md',
  build_id: 'abc123',
};

describe('helpCenterEventSchema', () => {
  it('accepts a well-formed versioned event', () => {
    expect(helpCenterEventSchema.safeParse(BASE).success).toBe(true);
  });

  it('rejects payloads carrying prohibited fields', () => {
    for (const banned of [
      { query: 'raw user query text' },
      { email: 'user@example.com' },
      { password: 'hunter2' },
      { dom_text: '<p>scraped</p>' },
      { path: '/docs/features/tips?token=x' },
      { user_id: 'user_123' },
      { ip: '10.0.0.1' },
    ]) {
      const result = helpCenterEventSchema.safeParse({ ...BASE, ...banned });
      expect(result.success, JSON.stringify(banned)).toBe(false);
    }
  });

  it('rejects raw query shapes even when disguised as a hash', () => {
    const result = helpCenterEventSchema.safeParse({
      schema_version: 1,
      event_id: 'opaque-help-id-1234:search_query_submitted',
      event: 'search_query_submitted',
      query_hash: 'how do I cancel my subscription',
    });
    expect(result.success).toBe(false);
  });

  it('requires event_id suffix to match the event type', () => {
    const result = helpCenterEventSchema.safeParse({
      ...BASE,
      event_id: 'opaque-help-id-1234:article_feedback',
    });
    expect(result.success).toBe(false);
  });

  it('requires event-specific properties', () => {
    const missingHash = helpCenterEventSchema.safeParse({
      schema_version: 1,
      event_id: 'opaque-help-id-1234:search_zero_results',
      event: 'search_zero_results',
    });
    expect(missingHash.success).toBe(false);

    const missingFeedback = helpCenterEventSchema.safeParse({
      schema_version: 1,
      event_id: 'opaque-help-id-1234:article_feedback',
      event: 'article_feedback',
      article_id: 'features/tips',
    });
    expect(missingFeedback.success).toBe(false);

    const ok = helpCenterEventSchema.safeParse({
      schema_version: 1,
      event_id: 'opaque-help-id-1234:search_result_selected',
      event: 'search_result_selected',
      result_id: 'features/tips',
      result_rank: 0,
      query_hash: '0123456789abcdef',
    });
    expect(ok.success).toBe(true);
  });
});

describe('helpCenterBatchSchema', () => {
  it('bounds batch size', () => {
    const events = Array.from(
      { length: HELP_CENTER_MAX_BATCH_SIZE + 1 },
      () => BASE
    );
    expect(helpCenterBatchSchema.safeParse({ events }).success).toBe(false);
    expect(helpCenterBatchSchema.safeParse({ events: [BASE] }).success).toBe(
      true
    );
  });
});
