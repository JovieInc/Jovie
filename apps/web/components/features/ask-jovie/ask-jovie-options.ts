// @coverage-via apps/web/components/features/ask-jovie/AskJovieWidget.test.tsx

export type FollowIntent = 'new_release_alerts' | 'local_show_alerts';

export type MessageCategory =
  | 'fan_mail'
  | 'booking'
  | 'press'
  | 'collaboration'
  | 'business'
  | 'other';

export const CATEGORY_LABELS: ReadonlyArray<{
  id: MessageCategory;
  label: string;
}> = [
  { id: 'fan_mail', label: 'Fan Message' },
  { id: 'booking', label: 'Booking' },
  { id: 'press', label: 'Press / Media' },
  { id: 'collaboration', label: 'Collab' },
  { id: 'business', label: 'Business' },
  { id: 'other', label: 'Other' },
];

export const SUGGESTED_QUESTIONS = [
  'Tell me about this artist',
  'What song should I start with?',
  'When are they playing in LA?',
  'Where can I listen?',
];

export const INTENT_LABELS: ReadonlyArray<{ id: FollowIntent; label: string }> =
  [
    { id: 'new_release_alerts', label: 'New Music Alerts' },
    { id: 'local_show_alerts', label: 'Local Show Alerts' },
  ];
