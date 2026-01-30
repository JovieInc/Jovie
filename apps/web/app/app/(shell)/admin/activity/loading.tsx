const ADMIN_ACTIVITY_ROW_KEYS = Array.from(
  { length: 8 },
  (_, i) => `activity-row-${i + 1}`
);

export default function AdminActivityLoading() {
  return (
    <div className='space-y-8'>
      <header className='space-y-2'>
        <div className='h-3 w-16 rounded skeleton' />
        <div className='h-9 w-40 rounded skeleton' />
        <div className='h-4 w-md max-w-full rounded skeleton' />
      </header>

      <div className='h-full overflow-hidden rounded-xl border border-subtle bg-surface-1/80'>
        <div className='space-y-2 border-b border-subtle px-6 py-5'>
          <div className='h-5 w-36 rounded skeleton' />
          <div className='h-3 w-24 rounded skeleton' />
        </div>

        <div className='px-0 pt-0'>
          <div className='overflow-x-auto'>
            <table className='w-full border-collapse text-sm'>
              <thead className='text-left'>
                <tr className='border-b border-subtle text-xs uppercase tracking-wide'>
                  <th className='px-4 py-3'>
                    <div className='h-3 w-12 rounded skeleton' />
                  </th>
                  <th className='px-4 py-3'>
                    <div className='h-3 w-14 rounded skeleton' />
                  </th>
                  <th className='hidden px-4 py-3 md:table-cell'>
                    <div className='h-3 w-20 rounded skeleton' />
                  </th>
                  <th className='px-4 py-3 text-right'>
                    <div className='ml-auto h-3 w-12 rounded skeleton' />
                  </th>
                </tr>
              </thead>
              <tbody>
                {ADMIN_ACTIVITY_ROW_KEYS.map(key => (
                  <tr
                    key={key}
                    className='border-b border-subtle last:border-b-0'
                  >
                    <td className='px-4 py-3'>
                      <div className='h-4 w-20 rounded skeleton' />
                    </td>
                    <td className='px-4 py-3'>
                      <div className='h-4 w-64 max-w-[60vw] rounded skeleton' />
                    </td>
                    <td className='hidden px-4 py-3 md:table-cell'>
                      <div className='h-4 w-36 rounded skeleton' />
                    </td>
                    <td className='px-4 py-3'>
                      <div className='ml-auto h-6 w-20 rounded-full skeleton' />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
