import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

const CONTACTS_HEADER_KEYS = [
  'col-role',
  'col-name',
  'col-territories',
  'col-email',
  'col-phone',
  'col-actions',
] as const;

const CONTACTS_ROW_KEYS = Array.from(
  { length: 5 },
  (_, i) => `contacts-row-${i + 1}`
);

/** Column widths matching the actual contacts table columns */
const COLUMN_WIDTHS: Record<string, string> = {
  'col-role': 'w-28',
  'col-name': 'w-32',
  'col-territories': 'w-24',
  'col-email': 'w-36',
  'col-phone': 'w-24',
  'col-actions': 'w-6',
};

export default function ContactsLoading() {
  return (
    <div className='flex h-full min-h-0 flex-col' aria-busy='true'>
      {/* Mobile: card layout (visible below sm) */}
      <div className='flex-1 min-h-0 overflow-auto sm:hidden'>
        <div className='divide-y divide-subtle'>
          {CONTACTS_ROW_KEYS.map(key => (
            <div key={key} className='flex items-center gap-3 px-4 py-3'>
              {/* Avatar placeholder */}
              <LoadingSkeleton
                height='h-10'
                width='w-10'
                rounded='full'
                className='shrink-0'
              />
              {/* Contact info */}
              <div className='flex-1 min-w-0 space-y-1.5'>
                <LoadingSkeleton height='h-4' width='w-32' rounded='md' />
                <LoadingSkeleton height='h-3' width='w-24' rounded='sm' />
                <LoadingSkeleton height='h-3' width='w-40' rounded='sm' />
              </div>
              {/* Action */}
              <LoadingSkeleton
                height='h-8'
                width='w-8'
                rounded='md'
                className='shrink-0'
              />
            </div>
          ))}
        </div>
      </div>

      {/* Desktop: table layout (hidden below sm) */}
      <div className='hidden flex-1 min-h-0 overflow-auto sm:block'>
        <table className='w-full border-collapse text-[13px]'>
          <thead className='sticky top-0 z-10 bg-surface-1'>
            <tr className='border-b border-subtle'>
              {CONTACTS_HEADER_KEYS.map(key => (
                <th key={key} className='px-4 py-3 text-left'>
                  <LoadingSkeleton
                    height='h-4'
                    width={COLUMN_WIDTHS[key] ?? 'w-20'}
                    rounded='md'
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CONTACTS_ROW_KEYS.map(rowKey => (
              <tr
                key={rowKey}
                className='border-b border-subtle'
                style={{ height: 44 }}
              >
                {CONTACTS_HEADER_KEYS.map(colKey => (
                  <td key={`${rowKey}-${colKey}`} className='px-4 py-2'>
                    <LoadingSkeleton
                      height='h-4'
                      width={COLUMN_WIDTHS[colKey] ?? 'w-20'}
                      rounded='md'
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer matching actual contacts footer */}
      <div className='shrink-0 flex items-center justify-between border-t border-subtle px-4 py-2'>
        <LoadingSkeleton height='h-4' width='w-20' rounded='md' />
        <LoadingSkeleton height='h-8' width='w-28' rounded='lg' />
      </div>
    </div>
  );
}
