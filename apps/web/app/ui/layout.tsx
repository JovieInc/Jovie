import Link from 'next/link';
import type { ReactNode } from 'react';

const NAV_ITEMS = [
  {
    label: 'Components',
    items: [
      { href: '/ui/buttons', label: 'Button', status: 'done' },
      { href: '/ui/dropdowns', label: 'Dropdown Menu', status: 'done' },
      { href: '/ui/tooltips', label: 'Tooltip', status: 'done' },
      { href: '/ui/inputs', label: 'Input', status: 'done' },
      { href: '/ui/badges', label: 'Badge', status: 'done' },
      { href: '/ui/checkboxes', label: 'Checkbox', status: 'done' },
      { href: '/ui/selects', label: 'Select', status: 'done' },
      { href: '/ui/avatars', label: 'Avatar', status: 'done' },
      { href: '/ui/switches', label: 'Switch', status: 'done' },
      { href: '/ui/dialogs', label: 'Dialog', status: 'done' },
    ],
  },
];

export default function UILayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <div className='flex min-h-screen bg-(--linear-bg-page) text-(--linear-text-primary)'>
      {/* Left nav */}
      <aside
        className='sticky top-0 flex h-screen w-52 shrink-0 flex-col overflow-y-auto border-r border-(--linear-border-subtle) py-6'
      >
        <div className='px-4 pb-4'>
          <span className='text-[11px] font-semibold uppercase tracking-wider text-(--linear-text-tertiary)'>
            UI Demo
          </span>
          <p className='mt-0.5 text-[11px] text-(--linear-text-tertiary)'>
            Linear parity review
          </p>
        </div>

        {NAV_ITEMS.map(group => (
          <div key={group.label} className='px-2'>
            <p className='px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-(--linear-text-tertiary)'>
              {group.label}
            </p>
            {group.items.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className='flex items-center justify-between rounded px-2 py-1.5 text-[13px] transition-colors hover:bg-(--linear-bg-surface-1) text-(--linear-text-tertiary) data-[status=done]:text-(--linear-text-primary)'
                data-status={item.status}
              >
                {item.label}
                {item.status === 'done' && (
                  <span className='h-1.5 w-1.5 rounded-full bg-(--linear-success)' />
                )}
              </Link>
            ))}
          </div>
        ))}
      </aside>

      {/* Content */}
      <main className='flex-1 overflow-y-auto p-10'>{children}</main>
    </div>
  );
}
