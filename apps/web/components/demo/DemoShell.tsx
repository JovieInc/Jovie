'use client';

import { Button } from '@jovie/ui';
import { BarChart3, Music2, Settings, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { AppShellFrame } from '@/components/organisms/AppShellFrame';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
} from '@/components/organisms/Sidebar';
import { APP_ROUTES } from '@/constants/routes';
import type { DemoTab } from './demo-types';

interface DemoShellProps {
  readonly activeTab: DemoTab;
  readonly onTabChange: (tab: DemoTab) => void;
  readonly children: ReactNode;
  readonly rightPanel?: ReactNode;
}

const TAB_LABEL: Record<DemoTab, string> = {
  releases: 'Releases',
  audience: 'Audience',
  analytics: 'Analytics',
  settings: 'Settings',
};

const NAV_ITEMS: { key: DemoTab; label: string; icon: typeof Music2 }[] = [
  { key: 'releases', label: 'Releases', icon: Music2 },
  { key: 'audience', label: 'Audience', icon: Users },
  { key: 'analytics', label: 'Analytics', icon: BarChart3 },
  { key: 'settings', label: 'Settings', icon: Settings },
];

export function DemoShell({
  activeTab,
  onTabChange,
  children,
  rightPanel,
}: Readonly<DemoShellProps>) {
  return (
    <SidebarProvider
      defaultOpen
      style={{ '--sidebar-width': '232px' } as React.CSSProperties}
    >
      <AppShellFrame
        sidebar={
          <Sidebar collapsible='none'>
            <SidebarHeader className='px-3 py-3'>
              <div className='flex items-center gap-2'>
                <BrandLogo size={20} />
                <span className='text-app font-medium text-sidebar-foreground'>
                  Sora Vale
                </span>
              </div>
            </SidebarHeader>

            <SidebarSeparator />

            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {NAV_ITEMS.map(item => (
                      <SidebarMenuItem key={item.key}>
                        <SidebarMenuButton
                          isActive={activeTab === item.key}
                          tooltip={item.label}
                          onClick={() => onTabChange(item.key)}
                        >
                          <item.icon className='size-4' />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>

            <SidebarFooter className='p-3'>
              <Button variant='secondary' size='sm' className='w-full' asChild>
                <a href={APP_ROUTES.SIGNUP}>Start free</a>
              </Button>
            </SidebarFooter>
          </Sidebar>
        }
        header={
          <header className='flex h-12 shrink-0 items-center justify-between border-b border-subtle px-4'>
            <div className='flex items-center gap-1.5 text-app'>
              <span className='text-tertiary-token'>Sora Vale</span>
              <span className='text-tertiary-token'>/</span>
              <span className='font-medium text-primary-token'>
                {TAB_LABEL[activeTab]}
              </span>
            </div>
            {activeTab === 'releases' && <Button size='sm'>Add release</Button>}
          </header>
        }
        main={children}
        rightPanel={rightPanel}
        isTableRoute={activeTab === 'releases'}
      />
    </SidebarProvider>
  );
}
