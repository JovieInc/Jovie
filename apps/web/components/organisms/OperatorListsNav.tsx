'use client';

import { Input } from '@jovie/ui';
import { List, ListFilter, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type KeyboardEvent, useState } from 'react';
import { toast } from '@/components/feedback';
import {
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/organisms/sidebar';
import { SHELL_RAIL_BLOCK_LABEL } from '@/components/shell/rail-motion';
import { APP_ROUTES } from '@/constants/routes';
import {
  getListErrorMessage,
  useCreateOvieListMutation,
  useOvieSidebarListsQuery,
} from '@/lib/queries/useOvieListsQuery';
import { cn } from '@/lib/utils';

export function listHref(id: string): string {
  return `${APP_ROUTES.ADMIN_LISTS}/${id}`;
}

export function smartViewHref(id: string): string {
  return `${APP_ROUTES.ADMIN_LISTS}/views/${id}`;
}

function NavRow({
  href,
  label,
  count,
  icon: Icon,
  active,
}: {
  readonly href: string;
  readonly label: string;
  readonly count: number;
  readonly icon: typeof List;
  readonly active: boolean;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={label}>
        <Link
          href={href}
          aria-current={active ? 'page' : undefined}
          className='flex w-full min-w-0 items-center gap-2 pr-8'
        >
          <Icon className='size-3.5' aria-hidden='true' />
          <span className='truncate'>{label}</span>
        </Link>
      </SidebarMenuButton>
      <SidebarMenuBadge aria-label={`${count} creators`}>
        {count}
      </SidebarMenuBadge>
    </SidebarMenuItem>
  );
}

function NewListRow() {
  const router = useRouter();
  const create = useCreateOvieListMutation();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setEditing(false);
      return;
    }
    create.mutate(trimmed, {
      onSuccess: ({ list }) => {
        setName('');
        setEditing(false);
        router.push(listHref(list.id));
      },
      onError: error => toast.error(getListErrorMessage(error)),
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setName('');
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <SidebarMenuItem>
        <Input
          autoFocus
          aria-label='New List Name'
          placeholder='List name'
          value={name}
          maxLength={60}
          disabled={create.isPending}
          onChange={event => setName(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (!name.trim()) setEditing(false);
          }}
        />
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton tooltip='New List' onClick={() => setEditing(true)}>
        <Plus className='size-3.5' aria-hidden='true' />
        <span className='truncate'>New List</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/**
 * Ovie-only sidebar block: the founder's lists ("Collab list", "Press") and
 * smart views with counts. Views with no matches are omitted by the server,
 * so the block only shows where there is work. Never rendered by the Jovie
 * creator shell's DashboardNav.
 */
export function OperatorListsNav({ pathname }: { readonly pathname: string }) {
  const query = useOvieSidebarListsQuery();
  const lists = query.data?.lists ?? [];
  const smartViews = query.data?.smartViews ?? [];

  return (
    <div data-testid='operator-lists-nav'>
      <span
        className={cn(
          'mb-1.5 block px-2.5 text-xs font-caption tracking-normal text-sidebar-muted/90',
          SHELL_RAIL_BLOCK_LABEL
        )}
      >
        Lists
      </span>
      <SidebarMenu aria-label='Lists'>
        {lists.map(list => (
          <NavRow
            key={list.id}
            href={listHref(list.id)}
            label={list.name}
            count={list.count}
            icon={List}
            active={pathname === listHref(list.id)}
          />
        ))}
        {smartViews.map(view => (
          <NavRow
            key={view.id}
            href={smartViewHref(view.id)}
            label={view.name}
            count={view.count}
            icon={ListFilter}
            active={pathname === smartViewHref(view.id)}
          />
        ))}
        <NewListRow />
      </SidebarMenu>
    </div>
  );
}
