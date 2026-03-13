'use client';

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
  PanelRightOpen,
  Plus,
  Repeat,
  SlidersHorizontal,
  Target,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { DashboardHeaderActionButton } from '@/components/dashboard/atoms/DashboardHeaderActionButton';
import { DashboardHeaderActionGroup } from '@/components/dashboard/atoms/DashboardHeaderActionGroup';
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
import {
  PageToolbar,
  PageToolbarActionButton,
  PageToolbarTabButton,
} from '@/components/organisms/table';
import { APP_ROUTES } from '@/constants/routes';
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

const VIEW_TABS = ['All Releases', 'Active', 'Backlog'] as const;

export function DemoShell({
  activeTab,
  onTabChange,
  children,
  rightPanel,
  containerClassName,
}: Readonly<DemoShellProps>) {
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(() =>
    Boolean(rightPanel)
  );
  const hasRightPanel = Boolean(rightPanel);

  useEffect(() => {
    if (hasRightPanel) {
      setIsRightPanelOpen(true);
    }
  }, [hasRightPanel]);

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
          <>
            <header className='flex h-[40px] shrink-0 items-center justify-between border-b border-(--linear-app-frame-seam) px-4 md:px-[var(--linear-app-header-padding-x)]'>
              <div className='flex min-w-0 items-center gap-1 text-[13px]'>
                <span className='truncate text-(--linear-text-tertiary)'>
                  Sora Vale
                </span>
                <ChevronRight className='size-3.5 shrink-0 text-(--linear-text-quaternary)' />
                <span className='truncate font-[510] text-(--linear-text-primary)'>
                  {TAB_LABEL[activeTab]}
                </span>
              </div>
              <DashboardHeaderActionGroup
                trailing={
                  hasRightPanel ? (
                    <DashboardHeaderActionButton
                      ariaLabel={
                        isRightPanelOpen
                          ? 'Hide details panel'
                          : 'Show details panel'
                      }
                      icon={
                        <PanelRightOpen
                          className='size-3.5'
                          aria-hidden='true'
                        />
                      }
                      iconOnly
                      pressed={isRightPanelOpen}
                      onClick={() => setIsRightPanelOpen(open => !open)}
                      tooltipLabel={
                        isRightPanelOpen
                          ? 'Hide Details Panel'
                          : 'Show Details Panel'
                      }
                    />
                  ) : null
                }
              >
                {activeTab === 'releases' ? (
                  <DashboardHeaderActionButton
                    ariaLabel='Create release'
                    icon={<Plus className='size-3.5' aria-hidden='true' />}
                    iconOnly
                    tooltipLabel='New Release'
                    className='h-8 w-8'
                  />
                ) : null}
              </DashboardHeaderActionGroup>
            </header>

            {(activeTab === 'releases' || activeTab === 'audience') && (
              <PageToolbar
                start={
                  activeTab === 'releases' ? (
                    <>
                      {VIEW_TABS.map((tab, i) => (
                        <PageToolbarTabButton
                          key={tab}
                          label={tab}
                          active={i === 0}
                        />
                      ))}
                      <PageToolbarActionButton
                        label='Add view'
                        icon={<Plus className='size-3.5' aria-hidden='true' />}
                        iconOnly
                        tooltipLabel='Add View'
                        ariaLabel='Add view'
                      />
                    </>
                  ) : null
                }
                end={
                  <>
                    <PageToolbarActionButton
                      label='Filter'
                      icon={
                        <ListFilter
                          className='size-3.5'
                          strokeWidth={2}
                          aria-hidden='true'
                        />
                      }
                      iconOnly
                      tooltipLabel='Filter'
                      ariaLabel='Open filter menu'
                    />
                    <PageToolbarActionButton
                      label='Display'
                      icon={
                        <SlidersHorizontal
                          className='size-3.5'
                          strokeWidth={2}
                          aria-hidden='true'
                        />
                      }
                      iconOnly
                      tooltipLabel='Display'
                      ariaLabel='Open display options'
                    />
                  </>
                }
              />
            )}
          </>
        }
        main={children}
        rightPanel={isRightPanelOpen ? rightPanel : undefined}
        isTableRoute={activeTab === 'releases' || activeTab === 'audience'}
      />
    </SidebarProvider>
  );
}
