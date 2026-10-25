'use client';

import { Input } from '@jovie/ui';
import { List, ListFilter, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type KeyboardEvent, useRef, useState } from 'react';
import { toast } from '@/components/feedback';
import { OPERATOR_NAV_GROUP_LABEL } from '@/components/organisms/operator-navigation';
import {
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuItem,
  useSidebar,
} from '@/components/organisms/sidebar';
import {
  SHELL_RAIL_LABEL,
  SHELL_RAIL_LABEL_OVERLAY,
} from '@/components/shell/rail-motion';
import {
  getSidebarNavIconClassName,
  getSidebarNavRowClassName,
} from '@/components/shell/SidebarNavItem';
import { Tooltip } from '@/components/shell/Tooltip';
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
  const { state, isMobile } = useSidebar();

  return (
    <SidebarMenuItem>
      <Tooltip label={label} side='right' block>
        <Link
          href={href}
          aria-current={active ? 'page' : undefined}
          aria-label={label}
          className={getSidebarNavRowClassName({
            calm: true,
            active,
            collapsed: state === 'closed' && !isMobile,
            className: 'rounded-lg',
          })}
        >
          <Icon
            className={getSidebarNavIconClassName({ calm: true, active })}
            aria-hidden='true'
          />
          <span
            className={cn(
              'min-w-0 truncate text-start',
              SHELL_RAIL_LABEL_OVERLAY
            )}
          >
            {label}
          </span>
        </Link>
      </Tooltip>
      <SidebarMenuBadge aria-label={`${count} creators`}>
        {count}
      </SidebarMenuBadge>
    </SidebarMenuItem>
  );
}

function GroupLabel({ children }: { readonly children: string }) {
  return (
    <span className={cn(OPERATOR_NAV_GROUP_LABEL, SHELL_RAIL_LABEL)}>
      {children}
    </span>
  );
}

function NewListRow() {
  const router = useRouter();
  const { state, isMobile, setOpen } = useSidebar();
  const create = useCreateOvieListMutation();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');

  const cancelEditing = () => {
    setName('');
    setEditing(false);
    requestAnimationFrame(() =>
      triggerRef.current?.focus({ preventScroll: true })
    );
  };

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      cancelEditing();
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
      cancelEditing();
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
      <Tooltip label='New List' side='right' block>
        <button
          type='button'
          ref={triggerRef}
          aria-label='New List'
          onClick={() => {
            if (state === 'closed' && !isMobile) setOpen(true);
            setEditing(true);
          }}
          className={getSidebarNavRowClassName({
            calm: true,
            collapsed: state === 'closed' && !isMobile,
            className: 'rounded-lg',
          })}
        >
          <Plus
            className={getSidebarNavIconClassName({ calm: true })}
            aria-hidden='true'
          />
          <span
            className={cn(
              'min-w-0 truncate text-start',
              SHELL_RAIL_LABEL_OVERLAY
            )}
          >
            New List
          </span>
        </button>
      </Tooltip>
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
    <div data-testid='operator-lists-nav' className='flex flex-col gap-4'>
      <div>
        <GroupLabel>Lists</GroupLabel>
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
          <NewListRow />
        </SidebarMenu>
      </div>
      {smartViews.length > 0 ? (
        <div>
          <GroupLabel>Smart Views</GroupLabel>
          <SidebarMenu aria-label='Smart Views'>
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
          </SidebarMenu>
        </div>
      ) : null}
    </div>
  );
}
