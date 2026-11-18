export const IN_PERSON_EVENT_TYPES = [
  'signing',
  'ama',
  'listening_party',
] as const;

export const IN_PERSON_EVENT_LABELS = {
  signing: 'Signing',
  ama: 'Q&A / AMA',
  listening_party: 'Listening Party',
} satisfies Record<(typeof IN_PERSON_EVENT_TYPES)[number], string>;
