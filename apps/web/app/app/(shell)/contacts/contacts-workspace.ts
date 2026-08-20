export type ContactsWorkspaceTab = 'contacts' | 'audience';

export function resolveContactsWorkspaceTab(
  value: string | readonly string[] | undefined
): ContactsWorkspaceTab {
  return value === 'audience' ? 'audience' : 'contacts';
}
