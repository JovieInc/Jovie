/**
 * Fixture: post-show invoice (not a booking confirmation).
 * Ground truth: should NOT suggest — invoice is after the fact.
 */
export const fixture = {
  id: 'invoice_not_booking',
  label: 'should_not_suggest' as const,
  email: {
    subject: 'Invoice #2026-0412 — Output Brooklyn, May 23 2026',
    from: 'accounting@outputclub.com',
    date: '2026-05-25T10:00:00Z',
    body: `Hi Tim,

Please find attached invoice #2026-0412 for your performance on May 23, 2026.

Amount due: $4,000
Payment terms: Net 30

Wire instructions enclosed.

Output Accounting`,
  },
  existingCalendarEvents: [],
  expectedEvent: null,
  note: 'Invoice after a completed show — extractor must not suggest creating a past event',
};
