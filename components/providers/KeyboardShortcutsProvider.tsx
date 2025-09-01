'use client';

/**
 * Keyboard Shortcuts Provider
 * 
 * Centralized provider for managing keyboard shortcuts across the application.
 * Uses a single event listener and delegates to registered shortcuts.
 */

import React, { createContext, useContext, useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import type { 
  KeyboardShortcutsContextValue,
  ShortcutRegistration,
  Shortcut,
  ShortcutContext,
  ShortcutScope
} from '@/lib/shortcuts/types';
import { shortcutsRegistry } from '@/lib/shortcuts/registry';
import { validateShortcuts } from '@/lib/shortcuts/validator';
import { buildSidebarShortcuts } from '@/lib/shortcuts/buildFromSidebar';

const KeyboardShortcutsContext = createContext<KeyboardShortcutsContextValue | null>(null);

interface KeyboardShortcutsProviderProps {
  children: React.ReactNode;
  currentScope?: ShortcutScope;
}

export function KeyboardShortcutsProvider({ 
  children, 
  currentScope = 'global' 
}: KeyboardShortcutsProviderProps) {
  const pathname = usePathname();
  const scopeStackRef = useRef<ShortcutScope[]>([currentScope]);
  const activeModalsRef = useRef<string[]>([]);
  
  // Register sidebar shortcuts on mount
  useEffect(() => {
    const sidebarRegistration = buildSidebarShortcuts();
    const unregister = shortcutsRegistry.register('sidebar-navigation', sidebarRegistration);
    
    return unregister;
  }, []);
  
  // Main keyboard event handler
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Build current context
    const context: ShortcutContext = {
      scope: scopeStackRef.current[scopeStackRef.current.length - 1] || 'global',
      activeModals: [...activeModalsRef.current],
      currentRoute: pathname,
      inputFocused: isInputFocused(event.target)
    };
    
    // Get combo string
    const combo = getComboFromEvent(event);
    if (!combo) return;
    
    // Find matching shortcuts
    const matchingShortcuts = shortcutsRegistry.getShortcutsByCombo(combo);
    
    // Filter by context
    const activeShortcuts = matchingShortcuts.filter(shortcut => 
      isShortcutActiveInContext(shortcut, context)
    );
    
    // Execute highest priority shortcut
    if (activeShortcuts.length > 0) {
      const shortcut = getHighestPriorityShortcut(activeShortcuts, context);
      
      // Check if shortcut should be ignored in inputs
      if (context.inputFocused && !shortcut.allowInInputs) {
        return;
      }
      
      try {
        const handled = shortcut.handler(event);
        
        if (handled !== false) {
          if (shortcut.preventDefault !== false) {
            event.preventDefault();
          }
          if (shortcut.stopPropagation !== false) {
            event.stopPropagation();
          }
        }
      } catch (error) {
        console.error(`Error executing shortcut ${shortcut.id}:`, error);
      }
    }
  }, [pathname]);
  
  // Set up global event listener
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown, { capture: true });
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [handleKeyDown]);
  
  // Context value
  const contextValue: KeyboardShortcutsContextValue = {
    registerShortcuts: (registration: ShortcutRegistration) => {
      const id = `registration-${Date.now()}-${Math.random()}`;
      return shortcutsRegistry.register(id, registration);
    },
    
    unregisterShortcuts: (source: string) => {
      shortcutsRegistry.unregister(source);
    },
    
    isShortcutActive: (id: string) => {
      const shortcut = shortcutsRegistry.getShortcut(id);
      if (!shortcut) return false;
      
      const context: ShortcutContext = {
        scope: scopeStackRef.current[scopeStackRef.current.length - 1] || 'global',
        activeModals: [...activeModalsRef.current],
        currentRoute: pathname,
        inputFocused: false // For checking if active, not execution
      };
      
      return isShortcutActiveInContext(shortcut, context);
    },
    
    getActiveShortcuts: () => {
      const context: ShortcutContext = {
        scope: scopeStackRef.current[scopeStackRef.current.length - 1] || 'global',
        activeModals: [...activeModalsRef.current],
        currentRoute: pathname,
        inputFocused: false
      };
      
      return shortcutsRegistry.getActiveShortcuts(context);
    },
    
    validateShortcuts
  };
  
  return (
    <KeyboardShortcutsContext.Provider value={contextValue}>
      {children}
    </KeyboardShortcutsContext.Provider>
  );
}

/**
 * Hook to use keyboard shortcuts context
 */
export function useKeyboardShortcuts(): KeyboardShortcutsContextValue {
  const context = useContext(KeyboardShortcutsContext);
  if (!context) {
    throw new Error('useKeyboardShortcuts must be used within KeyboardShortcutsProvider');
  }
  return context;
}

/**
 * Hook to register shortcuts in a component
 */
export function useShortcuts(registration: ShortcutRegistration) {
  const { registerShortcuts } = useKeyboardShortcuts();
  
  useEffect(() => {
    return registerShortcuts(registration);
  }, [registerShortcuts, registration]);
}

// Helper functions

function getComboFromEvent(event: KeyboardEvent): string | null {
  const parts: string[] = [];
  
  // Add modifiers
  if (event.metaKey || event.ctrlKey) {
    parts.push(event.metaKey ? 'cmd' : 'ctrl');
  }
  if (event.altKey) parts.push('alt');
  if (event.shiftKey) parts.push('shift');
  
  // Add key
  const key = event.key.toLowerCase();
  
  // Skip modifier keys alone
  if (['control', 'alt', 'shift', 'meta'].includes(key)) {
    return null;
  }
  
  // Normalize special keys
  const normalizedKey = normalizeKey(key);
  if (normalizedKey) {
    parts.push(normalizedKey);
  }
  
  return parts.length > 0 ? parts.join('+') : null;
}

function normalizeKey(key: string): string | null {
  switch (key) {
    case ' ':
      return 'space';
    case 'arrowup':
      return 'up';
    case 'arrowdown':
      return 'down';
    case 'arrowleft':
      return 'left';
    case 'arrowright':
      return 'right';
    default:
      return key.length === 1 ? key.toLowerCase() : key;
  }
}

function isInputFocused(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  
  const tagName = target.tagName.toLowerCase();
  const isContentEditable = target.getAttribute('contenteditable') === 'true';
  
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    isContentEditable
  );
}

function isShortcutActiveInContext(shortcut: Shortcut, context: ShortcutContext): boolean {
  // Check scope hierarchy: modal > sheet > page > global
  switch (shortcut.scope) {
    case 'modal':
      return context.activeModals.length > 0;
    case 'sheet':
      return context.scope === 'sheet' && context.activeModals.length === 0;
    case 'page':
      return ['page', 'sheet'].includes(context.scope) && context.activeModals.length === 0;
    case 'global':
      return true;
    default:
      return false;
  }
}

function getHighestPriorityShortcut(shortcuts: Shortcut[], context: ShortcutContext): Shortcut {
  // Sort by scope priority: modal > sheet > page > global
  const scopePriority = { modal: 4, sheet: 3, page: 2, global: 1 };
  
  return shortcuts.sort((a, b) => {
    const priorityA = scopePriority[a.scope] || 0;
    const priorityB = scopePriority[b.scope] || 0;
    return priorityB - priorityA;
  })[0];
}