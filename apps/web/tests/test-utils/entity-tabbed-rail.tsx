import type { EntityTabbedRailProps } from '@/components/molecules/drawer/EntityTabbedRail';

/** Business-test seam; the real shell layout and accessibility have their own suite. */
export function MockEntityTabbedRail({
  children,
  entityHeader,
  isEmpty,
  emptyMessage,
  activeTab,
  onTabChange,
  tabOptions,
  tabOverflowMode,
  tabActions,
  controls,
  tabbedCardTestId,
  testId,
  id,
  onClose,
  contextMenuItems,
}: EntityTabbedRailProps<string>) {
  if (isEmpty) return <p data-testid='empty-state'>{emptyMessage}</p>;
  return (
    <aside
      data-testid='right-drawer'
      data-context-action-ids={contextMenuItems
        ?.filter(item => item.type !== 'separator' && Boolean(item.id))
        .map(item => item.id)
        .join(',')}
    >
      <div
        id={id}
        data-testid={testId}
        data-scroll-strategy='child'
        data-mobile-dismissal='false'
        data-close-handler={onClose ? 'present' : 'none'}
      >
        {entityHeader}
        <section data-testid={tabbedCardTestId}>
          <nav data-testid='drawer-tabs' data-overflow-mode={tabOverflowMode}>
            {tabOptions.map(option => (
              <button
                key={option.value}
                data-testid={`drawer-tab-${option.value}`}
                type='button'
                role='tab'
                aria-selected={activeTab === option.value}
                onClick={() => onTabChange(option.value)}
              >
                {option.label}
              </button>
            ))}
            {tabActions}
          </nav>
          {controls}
          <div
            data-testid={
              tabbedCardTestId ? `${tabbedCardTestId}-scroll-region` : undefined
            }
          >
            {children}
          </div>
        </section>
        {contextMenuItems?.map(item =>
          item.type === 'action' && item.label ? (
            <button
              key={item.id}
              type='button'
              data-testid={`context-menu-${item.id}`}
              disabled={item.disabled}
              onClick={item.onClick}
            >
              {item.label}
            </button>
          ) : null
        )}
      </div>
    </aside>
  );
}
