export interface LinkActionsProps {
  readonly onToggle: () => void;
  readonly onRemove: () => void;
  readonly onEdit?: () => void;
  readonly isVisible: boolean;
  readonly showDragHandle?: boolean;
  readonly onDragHandlePointerDown?: (
    e: React.PointerEvent<HTMLButtonElement>
  ) => void;
  readonly className?: string;
  readonly isOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
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
