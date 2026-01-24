export interface LinkActionsProps {
  onToggle: () => void;
  onRemove: () => void;
  onEdit?: () => void;
  isVisible: boolean;
  showDragHandle?: boolean;
  onDragHandlePointerDown?: (e: React.PointerEvent<HTMLButtonElement>) => void;
  className?: string;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export interface MenuItem {
  id: string;
  label: string;
  action: () => void;
}

export interface UseLinkActionsMenuReturn {
  open: boolean;
  menuId: string;
  focusedIndex: number | null;
  menuItems: MenuItem[];
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  menuRef: React.RefObject<HTMLDivElement | null>;
  itemRefs: React.MutableRefObject<(HTMLButtonElement | null)[]>;
  setOpen: (next: boolean) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
}
