import { PageToolbar } from '@/components/organisms/table';
import {
  TableBody,
  TableHead,
  TableRoot,
} from '@/components/organisms/table/molecules/SemanticTable';
import { borders, presets } from '@/components/organisms/table/table.styles';
import { WorkspacePage } from '@/components/organisms/WorkspacePage';
import { cn } from '@/lib/utils';

/**
 * Header labels of the loaded Links table, in order. The skeleton keeps the
 * real header row so the table does not move when rows arrive;
 * `shell-route-skeleton.test.tsx` pins this list to `LinksPageClient`.
 */
export const LINKS_TABLE_HEADERS = [
  { name: 'Entity', align: 'left', bar: 'w-32' },
  { name: 'Type', align: 'left', bar: 'w-14' },
  { name: 'Status', align: 'left', bar: 'h-5 w-14 rounded-full' },
  { name: 'Destination', align: 'left', bar: 'w-40' },
  { name: 'Clicks', align: 'right', bar: 'ml-auto w-8' },
  { name: 'Campaign', align: 'left', bar: 'w-24' },
  { name: 'Jovie Link', align: 'right', bar: 'w-36' },
] as const;

const LINKS_SKELETON_ROW_KEYS = [
  'links-row-1',
  'links-row-2',
  'links-row-3',
  'links-row-4',
  'links-row-5',
  'links-row-6',
  'links-row-7',
  'links-row-8',
] as const;

/**
 * First-boot fallback for /app/links. Same page frame, toolbar and table
 * header as the loaded page, with the row content held back.
 */
export function LinksRouteSkeleton() {
  return (
    <WorkspacePage
      aria-busy='true'
      aria-label='Loading Links'
      aria-live='polite'
      frame='none'
      contentPadding='none'
      data-testid='links-route-skeleton'
      toolbar={
        <PageToolbar
          className='border-b border-subtle'
          start={<span className='skeleton h-4 w-14 rounded-sm' />}
        />
      }
    >
      <div className='flex min-h-0 flex-1 flex-col lg:flex-row'>
        <div className='min-w-0 flex-1 overflow-hidden'>
          <TableRoot className='w-full border-collapse'>
            <TableHead>
              <tr className={presets.tableHeaderRow}>
                {LINKS_TABLE_HEADERS.map(header => (
                  <th
                    key={header.name}
                    className={cn(
                      presets.tableHeaderCell,
                      'whitespace-nowrap',
                      header.align === 'right' && 'text-right'
                    )}
                  >
                    {header.name}
                  </th>
                ))}
              </tr>
            </TableHead>
            <TableBody>
              {LINKS_SKELETON_ROW_KEYS.map(rowKey => (
                <tr key={rowKey} className={cn(presets.tableRow, borders.cell)}>
                  {LINKS_TABLE_HEADERS.map(header => (
                    <td key={header.name} className={presets.tableCell}>
                      <span
                        aria-hidden='true'
                        className={cn(
                          'skeleton block h-(--space-3-5) rounded-sm motion-reduce:animate-none',
                          header.bar
                        )}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </TableBody>
          </TableRoot>
        </div>
      </div>
    </WorkspacePage>
  );
}
