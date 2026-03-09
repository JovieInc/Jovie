'use client';

// Re-export from unified RightPanelContext for backwards compatibility
export {
  RightPanelProvider as TablePanelProvider,
  useRightPanel as useTablePanel,
  useSetRightPanel as useSetTablePanel,
} from './RightPanelContext';
