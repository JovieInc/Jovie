'use client';

/**
 * Shortcut Scope Provider & Hook
 * 
 * Manages shortcut scopes (global > page > sheet > modal) with a stack-based system.
 * Higher-level scopes take precedence over lower-level ones.
 */

import React, { createContext, useContext, useCallback, useState } from 'react';
import type { ShortcutScope, ShortcutScopeContextValue } from '@/lib/shortcuts/types';

const ShortcutScopeContext = createContext<ShortcutScopeContextValue | null>(null);

interface ShortcutScopeProviderProps {
  children: React.ReactNode;
  initialScope?: ShortcutScope;
}

export function ShortcutScopeProvider({ 
  children, 
  initialScope = 'global' 
}: ShortcutScopeProviderProps) {
  const [scopeStack, setScopeStack] = useState<ShortcutScope[]>([initialScope]);
  
  const currentScope = scopeStack[scopeStack.length - 1] || 'global';
  
  const setScope = useCallback((scope: ShortcutScope) => {
    setScopeStack([scope]);
  }, []);
  
  const pushScope = useCallback((scope: ShortcutScope) => {
    setScopeStack(prev => [...prev, scope]);
  }, []);
  
  const popScope = useCallback(() => {
    setScopeStack(prev => {
      if (prev.length <= 1) return prev; // Keep at least one scope
      return prev.slice(0, -1);
    });
  }, []);
  
  const contextValue: ShortcutScopeContextValue = {
    currentScope,
    setScope,
    pushScope,
    popScope,
    scopeStack: [...scopeStack] // Return a copy
  };
  
  return (
    <ShortcutScopeContext.Provider value={contextValue}>
      {children}
    </ShortcutScopeContext.Provider>
  );
}

/**
 * Hook to use shortcut scope context
 */
export function useShortcutScope(): ShortcutScopeContextValue {
  const context = useContext(ShortcutScopeContext);
  if (!context) {
    throw new Error('useShortcutScope must be used within ShortcutScopeProvider');
  }
  return context;
}

/**
 * Hook to temporarily change scope within a component
 */
export function useScopedShortcuts(scope: ShortcutScope) {
  const { pushScope, popScope } = useShortcutScope();
  
  React.useEffect(() => {
    pushScope(scope);
    return () => {
      popScope();
    };
  }, [scope, pushScope, popScope]);
}

/**
 * Component to wrap content with a specific scope
 */
interface ShortcutScopeWrapperProps {
  scope: ShortcutScope;
  children: React.ReactNode;
}

export function ShortcutScopeWrapper({ scope, children }: ShortcutScopeWrapperProps) {
  useScopedShortcuts(scope);
  return <>{children}</>;
}

/**
 * HOC to wrap a component with a specific shortcut scope
 */
export function withShortcutScope<T extends object>(
  Component: React.ComponentType<T>,
  scope: ShortcutScope
) {
  const WrappedComponent = (props: T) => (
    <ShortcutScopeWrapper scope={scope}>
      <Component {...props} />
    </ShortcutScopeWrapper>
  );
  
  WrappedComponent.displayName = `withShortcutScope(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
}

/**
 * Hook for modal-specific shortcuts
 */
export function useModalShortcuts() {
  const { currentScope, pushScope, popScope } = useShortcutScope();
  
  const openModal = useCallback(() => {
    pushScope('modal');
  }, [pushScope]);
  
  const closeModal = useCallback(() => {
    if (currentScope === 'modal') {
      popScope();
    }
  }, [currentScope, popScope]);
  
  return { openModal, closeModal, isModalOpen: currentScope === 'modal' };
}

/**
 * Hook for sheet-specific shortcuts (drawers, sidebars, etc.)
 */
export function useSheetShortcuts() {
  const { currentScope, pushScope, popScope } = useShortcutScope();
  
  const openSheet = useCallback(() => {
    pushScope('sheet');
  }, [pushScope]);
  
  const closeSheet = useCallback(() => {
    if (currentScope === 'sheet') {
      popScope();
    }
  }, [currentScope, popScope]);
  
  return { openSheet, closeSheet, isSheetOpen: currentScope === 'sheet' };
}

/**
 * Hook to get current scope information
 */
export function useCurrentScope() {
  const { currentScope, scopeStack } = useShortcutScope();
  
  return {
    current: currentScope,
    stack: scopeStack,
    isGlobal: currentScope === 'global',
    isPage: currentScope === 'page',
    isSheet: currentScope === 'sheet',
    isModal: currentScope === 'modal',
    depth: scopeStack.length
  };
}