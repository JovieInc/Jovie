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
  inbox: 'Inbox',
  'my-releases': 'My Releases',
  campaigns: 'Campaigns',
  projects: 'Projects',
  views: 'Views',
  releases: 'Releases',
  audience: 'Audience',
  triage: 'Triage',
  cycles: 'Cycles',
  current: 'Current',
  upcoming: 'Upcoming',
  catalog: 'Catalog',
  'catalog-views': 'Views',
  analytics: 'Analytics',
  settings: 'Settings',
};

const toolbarBtnClass =
  'flex h-7 items-center justify-center gap-1.5 rounded-sm px-2 text-[13px] text-(--linear-text-tertiary) transition-colors duration-normal [font-weight:var(--font-weight-medium)] hover:bg-(--linear-bg-surface-2) hover:text-(--linear-text-primary)';

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
            <SidebarHeader className='relative h-12 justify-center gap-0 pl-2 pr-3.5 pt-0 pb-0'>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    size='sm'
                    className='h-7 font-medium'
                    aria-label='Open workspace selector'
                  >
                    <div className='flex items-center gap-1.5 w-full'>
                      <BrandLogo size={14} className='rounded-sm' tone='auto' />
                      <span className='truncate flex-1 text-app tracking-tight [font-weight:var(--font-weight-nav)]'>
                        Sora Vale
                      </span>
                      <ChevronDown className='size-3 shrink-0 text-sidebar-item-icon opacity-60' />
                    </div>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarHeader>

            <SidebarContent className='pl-2 pr-3.5'>
              {/* Top nav items */}
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu className='gap-0.5'>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        className='h-7'
                        isActive={activeTab === 'inbox'}
                        onClick={() => onTabChange('inbox')}
                      >
                        <Inbox className='size-3.5' />
                        <span className='flex-1'>Inbox</span>
                        <span className='rounded-[2px] border border-(--linear-border-default) bg-(--linear-bg-surface-2) px-1 py-px text-[10px] leading-none text-(--linear-text-secondary) [font-weight:var(--font-weight-medium)]'>
                          2
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        className='h-7'
                        isActive={activeTab === 'my-releases'}
                        onClick={() => onTabChange('my-releases')}
                      >
                        <Music2 className='size-3.5' />
                        <span>My Releases</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              {/* Workspace section */}
              <SidebarGroup>
                <SidebarGroupLabel className='text-2xs tracking-tight text-sidebar-item-icon px-2 [font-weight:var(--font-weight-nav)]'>
                  Workspace
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu className='gap-0.5'>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        className='h-7'
                        isActive={activeTab === 'campaigns'}
                        onClick={() => onTabChange('campaigns')}
                      >
                        <Target className='size-3.5' />
                        <span>Campaigns</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        className='h-7'
                        isActive={activeTab === 'projects'}
                        onClick={() => onTabChange('projects')}
                      >
                        <Folder className='size-3.5' />
                        <span>Projects</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        className='h-7'
                        isActive={activeTab === 'views'}
                        onClick={() => onTabChange('views')}
                      >
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
                <SidebarGroupLabel className='text-2xs tracking-tight text-sidebar-item-icon px-2 [font-weight:var(--font-weight-nav)]'>
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
                          <SidebarMenuSubButton
                            className='h-7'
                            isActive={activeTab === 'triage'}
                            onClick={() => onTabChange('triage')}
                          >
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
                          <SidebarMenuSubButton
                            className='h-7'
                            isActive={activeTab === 'cycles'}
                            onClick={() => onTabChange('cycles')}
                          >
                            <Repeat className='size-3.5' />
                            <span>Cycles</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            className='h-7'
                            isActive={activeTab === 'current'}
                            onClick={() => onTabChange('current')}
                          >
                            <CircleDot className='size-3.5' />
                            <span>Current</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            className='h-7'
                            isActive={activeTab === 'upcoming'}
                            onClick={() => onTabChange('upcoming')}
                          >
                            <Compass className='size-3.5' />
                            <span>Upcoming</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            className='h-7'
                            isActive={activeTab === 'catalog'}
                            onClick={() => onTabChange('catalog')}
                          >
                            <Archive className='size-3.5' />
                            <span>Catalog</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            className='h-7'
                            isActive={activeTab === 'catalog-views'}
                            onClick={() => onTabChange('catalog-views')}
                          >
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
                <SidebarGroupLabel className='text-2xs tracking-tight text-sidebar-item-icon px-2 [font-weight:var(--font-weight-nav)]'>
                  <ChevronRight className='size-3 mr-1' />
                  Collaborators
                </SidebarGroupLabel>
              </SidebarGroup>
            </SidebarContent>

            <SidebarFooter className='px-2 pb-3.5 pt-1'>
              <a
                href={APP_ROUTES.SIGNUP}
                className='flex h-7 items-center justify-center rounded-sm border border-(--linear-border-default) bg-(--linear-bg-surface-2) text-[13px] text-(--linear-text-secondary) transition-colors [font-weight:var(--font-weight-medium)] hover:bg-(--linear-bg-surface-3) hover:text-(--linear-text-primary)'
              >
                Sign up for Jovie
              </a>
            </SidebarFooter>
          </Sidebar>
        }
        header={
          <header className='flex h-11 shrink-0 items-center justify-between border-b border-(--linear-border-subtle) px-5 md:px-6'>
            <div className='flex items-center gap-4'>
              {/* Breadcrumb */}
              <div className='flex items-center text-[13px]'>
                <span className='text-(--linear-text-tertiary)'>Sora Vale</span>
                <ChevronRight className='mx-0.5 size-3.5 text-(--linear-text-quaternary)' />
                <span className='font-medium text-(--linear-text-primary)'>
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
                        'rounded-sm px-2 py-0.5 text-[13px] transition-colors duration-normal',
                        i === 0
                          ? 'bg-(--linear-bg-surface-2) text-(--linear-text-primary) [font-weight:var(--font-weight-medium)]'
                          : 'text-(--linear-text-tertiary) hover:bg-(--linear-bg-surface-2) hover:text-(--linear-text-secondary)'
                      )}
                    >
                      {tab}
                    </button>
                  ))}
                  <button
                    type='button'
                    className='rounded-sm px-1 py-0.5 text-(--linear-text-tertiary) transition-colors duration-normal hover:bg-(--linear-bg-surface-2) hover:text-(--linear-text-secondary)'
                    aria-label='Add view'
                  >
                    <Plus className='size-3.5' />
                  </button>
                </div>
              )}
            </div>

            {(activeTab === 'releases' || activeTab === 'audience') && (
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
                {activeTab === 'releases' && (
                  <Button size='sm' className='h-7 text-xs px-2.5'>
                    Add release
                  </Button>
                )}
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
