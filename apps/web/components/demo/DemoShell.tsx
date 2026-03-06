'use client';

import { Button } from '@jovie/ui';
import {
  Archive,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Compass,
  Eye,
  Folder,
  Inbox,
  Layers,
  ListFilter,
  MoreHorizontal,
  Music2,
  Plus,
  Repeat,
  SlidersHorizontal,
  Target,
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
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
} from '@/components/organisms/Sidebar';
import { APP_ROUTES } from '@/constants/routes';
import { cn } from '@/lib/utils';
import type { DemoTab } from './demo-types';

interface DemoShellProps {
  readonly activeTab: DemoTab;
  readonly onTabChange: (tab: DemoTab) => void;
  readonly children: ReactNode;
  readonly rightPanel?: ReactNode;
  readonly containerClassName?: string;
}

const TAB_LABEL: Record<DemoTab, string> = {
  releases: 'Releases',
  audience: 'Audience',
  analytics: 'Analytics',
  settings: 'Settings',
};

const toolbarBtnClass =
  'flex items-center justify-center h-7 px-2 text-tertiary-token hover:text-primary-token transition-colors duration-0 rounded hover:bg-interactive-hover gap-1.5 text-xs font-medium';

const VIEW_TABS = ['All Releases', 'Active', 'Backlog'] as const;

export function DemoShell({
  activeTab,
  onTabChange,
  children,
  rightPanel,
  containerClassName,
}: Readonly<DemoShellProps>) {
  return (
    <SidebarProvider
      defaultOpen
      style={{ '--sidebar-width': '244px' } as React.CSSProperties}
    >
      <AppShellFrame
        containerClassName={containerClassName}
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
              <a
                href={APP_ROUTES.SIGNUP}
                className='text-[11px] text-tertiary-token hover:text-primary-token transition-colors px-2 mt-0.5'
              >
                Sign up
              </a>
            </SidebarHeader>

            <SidebarContent className='pl-2 pr-3.5 mt-2'>
              {/* Top nav items */}
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu className='gap-0.5'>
                    <SidebarMenuItem>
                      <SidebarMenuButton className='h-7'>
                        <Inbox className='size-3.5' />
                        <span className='flex-1'>Inbox</span>
                        <span className='text-[11px] text-tertiary-token bg-white/[0.06] rounded px-1.5 py-0.5 leading-none'>
                          2
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton className='h-7'>
                        <Music2 className='size-3.5' />
                        <span>My Releases</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              {/* Workspace section */}
              <SidebarGroup>
                <SidebarGroupLabel className='text-[11px] uppercase tracking-wider text-sidebar-item-icon font-medium px-2'>
                  Workspace
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu className='gap-0.5'>
                    <SidebarMenuItem>
                      <SidebarMenuButton className='h-7'>
                        <Target className='size-3.5' />
                        <span>Campaigns</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton className='h-7'>
                        <Folder className='size-3.5' />
                        <span>Projects</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton className='h-7'>
                        <Eye className='size-3.5' />
                        <span>Views</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton className='h-7'>
                        <MoreHorizontal className='size-3.5' />
                        <span>More</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              {/* Your catalogs section — team tree */}
              <SidebarGroup>
                <SidebarGroupLabel className='text-[11px] uppercase tracking-wider text-sidebar-item-icon font-medium px-2'>
                  Your catalogs
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu className='gap-0.5'>
                    <SidebarMenuItem>
                      <SidebarMenuButton className='h-7'>
                        <BrandLogo
                          size={14}
                          className='rounded-[3px]'
                          tone='auto'
                        />
                        <span className='font-medium'>Sora Vale</span>
                      </SidebarMenuButton>
                      <SidebarMenuSub>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton className='h-7'>
                            <Layers className='size-3.5' />
                            <span>Triage</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            isActive={activeTab === 'releases'}
                            onClick={() => onTabChange('releases')}
                            className='h-7'
                          >
                            <Music2 className='size-3.5' />
                            <span>Releases</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            isActive={activeTab === 'audience'}
                            onClick={() => onTabChange('audience')}
                            className='h-7'
                          >
                            <Users className='size-3.5' />
                            <span>Audience</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton className='h-7'>
                            <Repeat className='size-3.5' />
                            <span>Cycles</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton className='h-7'>
                            <CircleDot className='size-3.5' />
                            <span>Current</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton className='h-7'>
                            <Compass className='size-3.5' />
                            <span>Upcoming</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton className='h-7'>
                            <Archive className='size-3.5' />
                            <span>Catalog</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton className='h-7'>
                            <Eye className='size-3.5' />
                            <span>Views</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      </SidebarMenuSub>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              {/* Collaborators section */}
              <SidebarGroup>
                <SidebarGroupLabel className='text-[11px] uppercase tracking-wider text-sidebar-item-icon font-medium px-2'>
                  <ChevronRight className='size-3 mr-1' />
                  Collaborators
                </SidebarGroupLabel>
              </SidebarGroup>
            </SidebarContent>

            <SidebarFooter className='p-2'>
              <div className='rounded-lg border border-subtle bg-white/[0.02] p-3'>
                <p className='text-[12px] font-medium text-primary-token mb-1'>
                  What&apos;s new
                </p>
                <p className='text-[11px] text-tertiary-token leading-relaxed'>
                  Smart links, pre-save campaigns, and more.
                </p>
              </div>
            </SidebarFooter>
          </Sidebar>
        }
        header={
          <header className='flex h-12 shrink-0 items-center justify-between px-5 md:px-6'>
            <div className='flex items-center gap-4'>
              {/* Breadcrumb */}
              <div className='flex items-center text-[13px]'>
                <span className='text-tertiary-token'>Sora Vale</span>
                <ChevronRight className='size-3.5 text-quaternary-token mx-0.5' />
                <span className='font-medium text-primary-token'>
                  {TAB_LABEL[activeTab]}
                </span>
              </div>

              {/* View tabs */}
              {activeTab === 'releases' && (
                <div className='flex items-center gap-0.5 ml-2'>
                  {VIEW_TABS.map((tab, i) => (
                    <button
                      key={tab}
                      type='button'
                      className={cn(
                        'px-2 py-1 text-[13px] rounded transition-colors',
                        i === 0
                          ? 'text-primary-token bg-white/[0.06] font-medium'
                          : 'text-tertiary-token hover:text-secondary-token'
                      )}
                    >
                      {tab}
                    </button>
                  ))}
                  <button
                    type='button'
                    className='px-1.5 py-1 text-tertiary-token hover:text-secondary-token rounded transition-colors'
                    aria-label='Add view'
                  >
                    <Plus className='size-3.5' />
                  </button>
                </div>
              )}
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
        isTableRoute={activeTab === 'releases' || activeTab === 'audience'}
      />
    </SidebarProvider>
  );
}
