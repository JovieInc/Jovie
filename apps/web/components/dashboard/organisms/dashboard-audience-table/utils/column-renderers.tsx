import type { CellContext } from '@tanstack/react-table';
import {
  AudienceActionsCell,
  AudienceDeviceCell,
  AudienceLocationCell,
  AudienceTypeBadge,
  AudienceUserCell,
  AudienceVisitsCell,
} from '@/components/dashboard/audience/table/atoms';
import type { AudienceMember } from '@/types';

/**
 * Renders the user cell with display name, type, email, and phone
 */
export function renderUserCell({
  row,
}: CellContext<AudienceMember, string | null>) {
  return (
    <AudienceUserCell
      displayName={row.original.displayName}
      type={row.original.type}
      email={row.original.email}
      phone={row.original.phone}
    />
  );
}

/**
 * Renders the type badge cell
 */
export function renderTypeCell({
  getValue,
}: CellContext<AudienceMember, AudienceMember['type']>) {
  return <AudienceTypeBadge type={getValue()} />;
}

/**
 * Renders the location cell
 */
export function renderLocationCell({
  getValue,
}: CellContext<AudienceMember, string | null>) {
  return <AudienceLocationCell locationLabel={getValue()} />;
}

/**
 * Renders the device type cell
 */
export function renderDeviceCell({
  getValue,
}: CellContext<AudienceMember, AudienceMember['deviceType']>) {
  return <AudienceDeviceCell deviceType={getValue()} />;
}

/**
 * Renders the visits cell with intent level
 */
export function renderVisitsCell({ row }: CellContext<AudienceMember, number>) {
  return (
    <AudienceVisitsCell
      visits={row.original.visits}
      intentLevel={row.original.intentLevel}
    />
  );
}

/**
 * Renders the actions cell
 */
export function renderActionsCell({
  row,
}: CellContext<AudienceMember, AudienceMember['latestActions']>) {
  return (
    <AudienceActionsCell
      rowId={row.original.id}
      actions={row.original.latestActions}
    />
  );
}

/**
 * Renders the email cell for subscribers
 */
export function renderEmailCell({
  getValue,
}: CellContext<AudienceMember, string | null>) {
  return <span className='text-secondary-token'>{getValue() ?? '—'}</span>;
}
