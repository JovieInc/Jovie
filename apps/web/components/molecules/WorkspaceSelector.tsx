'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { Check, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import type { AppShellWorkspace } from '@/lib/app-shell/workspaces';
import { cn } from '@/lib/utils';

interface WorkspaceSelectorProps<Id extends string> {
  readonly currentWorkspaceId: Id;
  readonly workspaces: readonly AppShellWorkspace<Id>[];
}

export function WorkspaceSelector<Id extends string>({
  currentWorkspaceId,
  workspaces,
}: WorkspaceSelectorProps<Id>) {
  const currentWorkspace =
    workspaces.find(workspace => workspace.id === currentWorkspaceId) ??
    workspaces[0];

  if (!currentWorkspace) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type='button'
          aria-label='Switch Workspace'
          data-electron-no-drag='true'
          style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
          className={cn(
            'flex h-7 w-full items-center gap-1.5 rounded-lg px-2.5 transition-colors duration-subtle ease-subtle hover:bg-sidebar-accent/55 focus-visible:outline-none focus-visible:bg-sidebar-accent/55',
            'group-data-[collapsible=icon]:justify-center'
          )}
        >
          <BrandLogo
            size={14}
            tone='auto'
            variant={currentWorkspace.brandVariant}
            rounded={false}
            className='shrink-0 rounded-sm'
            aria-hidden
          />
          <span className='truncate flex-1 text-left text-app tracking-tight text-sidebar-item-foreground [font-weight:var(--font-weight-nav)] group-data-[collapsible=icon]:hidden'>
            {currentWorkspace.label}
          </span>
          <ChevronDown
            className='size-2.5 shrink-0 text-sidebar-item-icon group-data-[collapsible=icon]:hidden'
            aria-hidden='true'
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='start' sideOffset={4} className='w-48'>
        {workspaces.map(workspace => {
          const isCurrent = workspace.id === currentWorkspace.id;
          return (
            <DropdownMenuItem key={workspace.id} asChild>
              <Link
                href={workspace.href}
                aria-current={isCurrent ? 'page' : undefined}
                className='flex items-center gap-2'
              >
                <BrandLogo
                  size={14}
                  tone='auto'
                  variant={workspace.brandVariant}
                  rounded={false}
                  className='shrink-0 rounded-sm'
                  aria-hidden
                />
                <span className='min-w-0 flex-1 truncate'>
                  {workspace.label}
                </span>
                {isCurrent ? (
                  <Check
                    className='size-3.5 shrink-0 text-primary-token'
                    aria-hidden='true'
                  />
                ) : null}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
