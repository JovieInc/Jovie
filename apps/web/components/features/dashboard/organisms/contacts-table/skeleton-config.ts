/**
 * Loading geometry for the contacts table, shared by the route's loading.tsx
 * and the client table so both paint the same 32px dense rows.
 * Order: name, role, territories, email, phone, actions.
 */
export const CONTACTS_SKELETON_COLUMN_CONFIG = [
  { width: '160px', variant: 'person' as const },
  { width: '112px', variant: 'text' as const },
  { width: '96px', variant: 'badge' as const },
  { width: '144px', variant: 'text' as const },
  { width: '96px', variant: 'text' as const },
  { width: '24px', variant: 'badge' as const },
];
