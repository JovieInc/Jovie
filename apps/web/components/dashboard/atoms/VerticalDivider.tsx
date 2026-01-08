/**
 * VerticalDivider - Subtle vertical separator for header action groups
 *
 * Used to visually separate different groups of actions in the dashboard header,
 * such as between sidebar toggle buttons and other action buttons.
 *
 * Note: This is a purely decorative element and does not need ARIA attributes.
 */
export function VerticalDivider() {
  return <div className='h-5 w-px bg-border-subtle' aria-hidden='true' />;
}
