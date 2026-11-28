import { PersonCell, type PersonCellProps } from '../atoms/PersonCell';

export type IdentityCellProps = PersonCellProps;

/**
 * Avatar or initials, a primary label (text-app, medium, primary) and one
 * optional tertiary descriptor, single line with clamp truncation.
 */
export function IdentityCell(props: IdentityCellProps) {
  return <PersonCell {...props} />;
}
