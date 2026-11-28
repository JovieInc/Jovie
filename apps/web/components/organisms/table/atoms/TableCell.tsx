import { cn } from '@jovie/ui/lib/utils';
import { borders, presets, tableAlignment } from '../table.styles';
import { APP_TABLE_CELL_CONTENT_CLASSNAME } from './app-table-row';

/**
 * Alias of the shared app table cell host (flex + items-center). Kept as the
 * historical export so existing VirtualizedTableRow / TableCell call sites
 * pick up the vertical-center contract without a second class name.
 */
export const TABLE_CELL_CONTENT_CLASSNAME = APP_TABLE_CELL_CONTENT_CLASSNAME;

/** Allow wrapping within the height budget selected by the table row mode. */
export const TABLE_CELL_MULTILINE_CONTENT_CLASSNAME =
  'whitespace-normal leading-normal';

export interface TableCellProps {
  readonly children: React.ReactNode;
  readonly width?: string; // e.g., 'w-14', 'w-65'
  readonly align?: 'left' | 'center' | 'right';
  readonly className?: string;
  readonly multiline?: boolean;
  readonly hideOnMobile?: boolean;
  readonly as?: 'td' | 'th';
}

export function TableCell({
  children,
  width,
  align = 'left',
  className,
  multiline = false,
  hideOnMobile = false,
  as: Component = 'td',
}: TableCellProps) {
  return (
    <Component
      className={cn(
        borders.cell,
        presets.tableCell,
        // Width
        width,
        // Alignment
        tableAlignment.text[align],
        // Responsive hiding
        hideOnMobile && 'max-md:hidden md:table-cell',
        // Custom classes
        className
      )}
    >
      <div
        className={cn(
          TABLE_CELL_CONTENT_CLASSNAME,
          multiline && TABLE_CELL_MULTILINE_CONTENT_CLASSNAME
        )}
        data-table-cell-content='stable'
        data-app-table-cell='content'
      >
        {children}
      </div>
    </Component>
  );
}
