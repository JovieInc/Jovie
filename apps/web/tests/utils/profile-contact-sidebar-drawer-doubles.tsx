/**
 * Drawer doubles for ProfileContactSidebar.test.tsx, loaded through
 * vi.mock('@/components/molecules/drawer', () => import(...)).
 */

export const EntitySidebarShell = ({
  children,
  'data-testid': testId,
  id,
  onClose,
  showMobileDismissal = false,
  presentation,
}: {
  children: React.ReactNode;
  id?: string;
  onClose?: () => void;
  showMobileDismissal?: boolean;
  presentation?: string;
  'data-testid'?: string;
}) => (
  <aside
    id={id}
    data-testid={testId}
    data-presentation={presentation}
    data-close-handler={onClose ? 'present' : 'none'}
    data-mobile-dismissal={String(showMobileDismissal)}
  >
    {children}
  </aside>
);

export const DrawerTabbedCard = ({
  children,
  tabs,
  testId,
}: {
  children: React.ReactNode;
  tabs: React.ReactNode;
  testId: string;
}) => (
  <section data-testid={testId}>
    {tabs}
    <div data-testid={`${testId}-scroll-region`}>{children}</div>
  </section>
);

export const DrawerTabs = ({
  onValueChange,
  actions,
}: {
  onValueChange: (value: string) => void;
  actions?: React.ReactNode;
}) => (
  <nav>
    <button type='button' onClick={() => onValueChange('social')}>
      Social
    </button>
    <button type='button' onClick={() => onValueChange('about')}>
      About
    </button>
    {actions}
  </nav>
);
