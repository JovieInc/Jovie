'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { usePathname } from 'next/navigation';

import { PendingClaimRunner } from '@/components/bridge/PendingClaimRunner';
import { DashboardNav } from '@/components/dashboard/DashboardNav';
import { EnhancedThemeToggle } from '@/components/dashboard/molecules/EnhancedThemeToggle';
import { FeedbackButton } from '@/components/dashboard/molecules/FeedbackButton';
import { PendingClaimHandler } from '@/components/dashboard/PendingClaimHandler';
import { UserButton } from '@/components/molecules/UserButton';
// import { Button } from '@/components/ui/Button';
// import { Logo } from '@/components/ui/Logo';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/Sidebar';
// Dropdown menu imports removed until used

import type { DashboardData } from './actions';

interface DashboardLayoutClientProps {
  dashboardData: DashboardData;
  persistSidebarCollapsed?: (collapsed: boolean) => Promise<void>;
  children: React.ReactNode;
}

export default function DashboardLayoutClient({
  dashboardData,
  persistSidebarCollapsed,
  children,
}: DashboardLayoutClientProps) {
  const [, startTransition] = useTransition();
  const pathname = usePathname();

  // Build a simple breadcrumb from the current path
  const crumbs = (() => {
    const parts = (pathname || '/dashboard')
      .split('/')
      .filter(Boolean);
    const idx = parts.indexOf('dashboard');
    const subs = idx >= 0 ? parts.slice(idx + 1) : [];
    const toTitle = (s: string): string =>
      s
        .replace(/-/g, ' ')
        .replace(/\b\w/g, ch => ch.toUpperCase());
    const items: Array<{ label: string; href?: string }> = [
      { label: 'Dashboard', href: '/dashboard/overview' },
    ];
    if (subs.length > 0) {
      let acc = '/dashboard';
      subs.forEach((seg, i) => {
        acc += `/${seg}`;
        const isLast = i === subs.length - 1;
        items.push({ label: toTitle(seg), href: isLast ? undefined : acc });
      });
    }
    return items;
  })();

  // For sidebar-08 pattern, we'll use the built-in state management
  const [sidebarOpen, setSidebarOpen] = useState(!(dashboardData.sidebarCollapsed ?? false));

  // Handle persistence of sidebar state
  const handleOpenChange = (open: boolean) => {
    setSidebarOpen(open);
    if (persistSidebarCollapsed) {
      startTransition(() => {
        void persistSidebarCollapsed(!open);
      });
    }
  };

  // Sync with localStorage
  useEffect(() => {
    const serverValue = !(dashboardData.sidebarCollapsed ?? false);
    try {
      const stored = localStorage.getItem('dashboard.sidebarCollapsed');
      if (stored === null) {
        localStorage.setItem('dashboard.sidebarCollapsed', serverValue ? '0' : '1');
        setSidebarOpen(serverValue);
      } else {
        const storedBool = stored === '0';
        if (storedBool !== serverValue) {
          localStorage.setItem('dashboard.sidebarCollapsed', serverValue ? '0' : '1');
          setSidebarOpen(serverValue);
        } else {
          setSidebarOpen(storedBool);
        }
      }
    } catch {
      // ignore storage errors
    }
  }, [dashboardData.sidebarCollapsed]);

  return (
    <>
      <PendingClaimRunner />
      <PendingClaimHandler />

      <SidebarProvider open={sidebarOpen} onOpenChange={handleOpenChange}>
        <div className="min-h-screen bg-base">
          <Sidebar variant="inset">
            <SidebarHeader>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton size="lg" asChild>
                    <Link href="/dashboard/overview">
                      <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                        <Image
                          src="/brand/Jovie-Logo-Icon.svg"
                          alt="Jovie"
                          width={16}
                          height={16}
                          className="size-4"
                        />
                      </div>
                      <div className="grid flex-1 text-left text-sm leading-tight">
                        <span className="truncate font-semibold">Jovie</span>
                        <span className="truncate text-xs">Creator Dashboard</span>
                      </div>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
              <DashboardNav />
            </SidebarContent>

            <SidebarFooter>
              <SidebarMenu>
                <SidebarMenuItem>
                  <div className="flex items-center gap-2 px-2 py-1">
                    <EnhancedThemeToggle variant="compact" />
                    <FeedbackButton collapsed={false} />
                  </div>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton size="lg" asChild>
                    <div>
                      <UserButton showUserInfo={true} />
                    </div>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarFooter>
            <SidebarRail />
          </Sidebar>

          <SidebarInset>
            <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b border-subtle bg-base/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-base/60 transition-[height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
              <SidebarTrigger className="-ml-1" />
              <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-secondary-token">
                {crumbs.map((c, i) => {
                  const isLast = i === crumbs.length - 1;
                  return (
                    <span key={`${c.label}-${i}`} className="flex items-center gap-1">
                      {c.href && !isLast ? (
                        <Link href={c.href} className="hover:underline">
                          {c.label}
                        </Link>
                      ) : (
                        <span className="text-primary-token">{c.label}</span>
                      )}
                      {!isLast && <span className="text-tertiary-token">/</span>}
                    </span>
                  );
                })}
              </nav>
            </header>
            <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
              <div className="container mx-auto w-full max-w-5xl px-0">
                {children}
              </div>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </>
  );
}
