'use client';

import { Button } from '@jovie/ui';
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  ListFilter,
  Music2,
  Settings,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
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

const toolbarBtnClass =
  'flex items-center justify-center h-7 px-2 text-tertiary-token hover:text-primary-token transition-colors duration-0 rounded hover:bg-interactive-hover gap-1.5 text-xs font-medium';

export function DemoShell({
  activeTab,
  onTabChange,
  children,
  rightPanel,
}: Readonly<DemoShellProps>) {
  return (
    <SidebarProvider
      defaultOpen
      style={{ '--sidebar-width': '244px' } as React.CSSProperties}
    >
      <AppShellFrame
        sidebar={
          <Sidebar collapsible='none'>
            <SidebarHeader className='px-2 pt-2 pb-0 h-9 justify-center'>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    size='sm'
                    className='h-7 font-medium'
                    aria-label='Open workspace selector'
                  >
                    <div className='flex items-center gap-1.5 w-full'>
                      <BrandLogo
                        size={16}
                        className='rounded-[4px]'
                        tone='auto'
                      />
                      <span className='truncate flex-1'>Sora Vale</span>
                      <ChevronDown className='size-3 shrink-0 text-sidebar-item-icon opacity-60' />
                    </div>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarHeader>

            <SidebarContent className='pl-2 pr-3.5 mt-2'>
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu className='gap-0.5'>
                    {NAV_ITEMS.map(item => (
                      <SidebarMenuItem key={item.key}>
                        <SidebarMenuButton
                          isActive={activeTab === item.key}
                          tooltip={item.label}
                          onClick={() => onTabChange(item.key)}
                          className='h-7'
                        >
                          <item.icon className='size-3.5' />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>

            <SidebarFooter className='p-2'>
              <Button
                variant='secondary'
                className='h-7 text-xs w-full justify-center'
                asChild
              >
                <a href={APP_ROUTES.SIGNUP}>Start free</a>
              </Button>
            </SidebarFooter>
          </Sidebar>
        }
        header={
          <header className='flex h-12 shrink-0 items-center justify-between px-5 md:px-6'>
            <div className='flex items-center text-[13px]'>
              <span className='text-tertiary-token'>Sora Vale</span>
              <ChevronRight className='size-3.5 text-quaternary-token mx-0.5' />
              <span className='font-medium text-primary-token'>
                {TAB_LABEL[activeTab]}
              </span>
            </div>
            {activeTab === 'releases' && (
              <div className='flex items-center gap-2'>
                <div className='flex items-center mr-2 gap-1'>
                  <button
                    type='button'
                    className={toolbarBtnClass}
                    aria-label='Open filter menu'
                  >
                    <ListFilter className='size-3.5' />
                    <span>Filter</span>
                  </button>
                  <button
                    type='button'
                    className={toolbarBtnClass}
                    aria-label='Open display options'
                  >
                    <SlidersHorizontal className='size-3.5' />
                    <span>Display</span>
                  </button>
                </div>
                <Button size='sm' className='h-7 text-xs px-2.5'>
                  Add release
                </Button>
              </div>
            )}
          </header>
        }
        main={children}
        rightPanel={rightPanel}
        isTableRoute={activeTab === 'releases'}
      />
    </SidebarProvider>
  );
}
