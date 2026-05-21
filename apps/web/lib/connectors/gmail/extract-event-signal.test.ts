import { describe, expect, it } from 'vitest';
import * as extractModule from './extract-event-signal';

// ---------------------------------------------------------------------------
// SECURITY: Ensure gmail send does not exist
// ---------------------------------------------------------------------------

describe('gmail/extract-event-signal security invariants', () => {
  it('must NOT export a function named "send"', () => {
    // This test exists to prevent accidental export of a gmail.send function,
    // which could be misused to send emails via the connector module.
    expect(typeof (extractModule as Record<string, unknown>)['send']).toBe(
      'undefined'
    );
  });

  it('exports extractEventSignal', () => {
    expect(typeof extractModule.extractEventSignal).toBe('function');
  });

  it('exports assertDailyBudget', () => {
    expect(typeof extractModule.assertDailyBudget).toBe('function');
  });

  it('does not export a send function under any key', () => {
    const keys = Object.keys(extractModule);
    const sendKeys = keys.filter(k => k.toLowerCase().includes('send'));
    expect(sendKeys).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

describe('extractEventSignalOutputSchema', () => {
  it('accepts valid extraction output', () => {
    const valid = {
      events: [
        {
          title: 'DJ Set at Output Brooklyn',
          startsAt: '2026-05-23T01:00:00-04:00',
          endsAt: '2026-05-23T03:00:00-04:00',
          venueName: 'Output Brooklyn',
          city: 'Brooklyn',
          region: 'New York',
          country: 'US',
          confidence: 0.95,
          rationale: 'Email confirms booking at Output Brooklyn on May 23.',
          sourceRef: {
            messageId: 'fixture-msg-001',
            subject: 'Booking Confirmation — Output Brooklyn, May 23 2026',
          },
        },
      ],
    };

    const result =
      extractModule.extractEventSignalOutputSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects events with missing required fields', () => {
    const invalid = {
      events: [
        {
          title: 'Missing startsAt',
          // startsAt is missing
          endsAt: null,
          venueName: null,
          city: null,
          region: null,
          country: null,
          confidence: 0.8,
          rationale: 'test',
          sourceRef: { messageId: 'x', subject: 'y' },
        },
      ],
    };

    const result =
      extractModule.extractEventSignalOutputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects confidence outside 0-1 range', () => {
    const invalid = {
      events: [
        {
          title: 'Test',
          startsAt: '2026-05-23T01:00:00Z',
          endsAt: null,
          venueName: null,
          city: null,
          region: null,
          country: null,
          confidence: 1.5, // invalid
          rationale: 'test',
          sourceRef: { messageId: 'x', subject: 'y' },
        },
      ],
    };

    const result =
      extractModule.extractEventSignalOutputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('accepts empty events array', () => {
    const result = extractModule.extractEventSignalOutputSchema.safeParse({
      events: [],
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Budget guard
// ---------------------------------------------------------------------------

describe('BudgetExceededError', () => {
  it('is a proper error with name', () => {
    const err = new extractModule.BudgetExceededError(
      'user-123',
      100001,
      100000
    );
    expect(err.name).toBe('BudgetExceededError');
    expect(err.userId).toBe('user-123');
    expect(err.usedTokens).toBe(100001);
    expect(err.budgetTokens).toBe(100000);
    expect(err.message).toContain('100001');
  });
});

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

describe('gmailMessageInputSchema', () => {
  it('accepts valid message input', () => {
    const valid = {
      messageId: 'msg-001',
      subject: 'Booking Confirmation',
      from: 'bookings@venue.com',
      date: 'Mon, 12 May 2026 14:30:00 -0400',
      snippet: 'Confirmed for May 23, 2026.',
    };
    expect(extractModule.gmailMessageInputSchema.safeParse(valid).success).toBe(
      true
    );
  });
});
