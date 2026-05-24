/**
 * Fixture: music industry newsletter, not a booking.
 * Ground truth: should NOT suggest — no booking for Tim White here.
 */
export const fixture = {
  id: 'newsletter_not_booking',
  label: 'should_not_suggest' as const,
  email: {
    subject: 'DJ Mag: 5 Artists To Watch This Summer',
    from: 'newsletter@djmag.com',
    date: '2026-05-10T08:00:00Z',
    body: `DJ Mag Weekly Newsletter

5 Artists To Watch This Summer

1. Charlotte de Witte — Drumcode, July 4 @ Awakenings
2. Objekt — Hessle Audio showcase, July 11 @ Fabric
3. KiNK — Dekmantel Festival, August 1
4. Amelie Lens — Movement, various dates
5. Blawan — boilerroom.tv Live Stream, July 20

Stay tuned for our full festival guide.

DJ Mag Team`,
  },
  existingCalendarEvents: [],
  expectedEvent: null,
  note: 'Newsletter about other artists — no booking for Tim White',
};
