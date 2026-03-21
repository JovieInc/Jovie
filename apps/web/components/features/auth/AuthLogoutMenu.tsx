'use client';

import { SignOutButton } from '@clerk/nextjs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { MoreHorizontal } from 'lucide-react';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';

interface AuthLogoutMenuProps {
  readonly logoutRedirectUrl: string;
}

export function AuthLogoutMenu({
  logoutRedirectUrl,
}: Readonly<AuthLogoutMenuProps>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <CircleIconButton size='sm' variant='outline' ariaLabel='Open menu'>
          <MoreHorizontal />
        </CircleIconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' sideOffset={8}>
        <SignOutButton redirectUrl={logoutRedirectUrl}>
          <DropdownMenuItem>Log out</DropdownMenuItem>
        </SignOutButton>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
