/**
 * Centralized Keyboard Shortcuts Registry
 * 
 * Single source of truth for all keyboard shortcuts in the application.
 * Provides conflict detection, scope management, and platform normalization.
 */

import type { 
  Shortcut, 
  ShortcutRegistration, 
  ShortcutScope, 
  ShortcutContext,
  Platform 
} from './types';
import { validateShortcuts } from './validator';

class ShortcutsRegistry {
  private shortcuts: Map<string, Shortcut> = new Map();
  private registrations: Map<string, ShortcutRegistration> = new Map();
  private platform: Platform = this.detectPlatform();
  
  /**
   * Register a set of shortcuts
   */
  register(id: string, registration: ShortcutRegistration): () => void {
    // Validate shortcuts before registering
    const validation = validateShortcuts(registration.shortcuts);
    if (!validation.isValid) {
      const conflicts = validation.conflicts
        .filter(c => c.severity === 'error')
        .map(c => c.combo)
        .join(', ');
      throw new Error(`Shortcut registration failed: conflicts detected for ${conflicts}`);
    }
    
    // Warn about non-critical issues
    if (validation.warnings.length > 0) {
      console.warn('Shortcut registration warnings:', validation.warnings);
    }
    
    // Store registration
    this.registrations.set(id, registration);
    
    // Add shortcuts to registry
    for (const shortcut of registration.shortcuts) {
      this.shortcuts.set(shortcut.id, shortcut);
    }
    
    // Return unregister function
    return () => this.unregister(id);
  }
  
  /**
   * Unregister shortcuts by registration ID
   */
  unregister(id: string): void {
    const registration = this.registrations.get(id);
    if (!registration) return;
    
    // Remove shortcuts from registry
    for (const shortcut of registration.shortcuts) {
      this.shortcuts.delete(shortcut.id);
    }
    
    // Remove registration
    this.registrations.delete(id);
  }
  
  /**
   * Get all active shortcuts for a given context
   */
  getActiveShortcuts(context: ShortcutContext): Shortcut[] {
    return Array.from(this.shortcuts.values()).filter(shortcut => 
      this.isShortcutActiveInContext(shortcut, context)
    );
  }
  
  /**
   * Get shortcut by ID
   */
  getShortcut(id: string): Shortcut | undefined {
    return this.shortcuts.get(id);
  }
  
  /**
   * Get all shortcuts
   */
  getAllShortcuts(): Shortcut[] {
    return Array.from(this.shortcuts.values());
  }
  
  /**
   * Get shortcuts by combo
   */
  getShortcutsByCombo(combo: string): Shortcut[] {
    const normalizedCombo = this.normalizeCombo(combo);
    return Array.from(this.shortcuts.values()).filter(shortcut => {
      const combos = Array.isArray(shortcut.combo) ? shortcut.combo : [shortcut.combo];
      return combos.some(c => this.normalizeCombo(c) === normalizedCombo);
    });
  }
  
  /**
   * Check if a shortcut is active in the given context
   */
  private isShortcutActiveInContext(shortcut: Shortcut, context: ShortcutContext): boolean {
    // Check scope hierarchy: modal > sheet > page > global
    switch (shortcut.scope) {
      case 'modal':
        return context.activeModals.length > 0;
      case 'sheet':
        return context.scope === 'sheet' && context.activeModals.length === 0;
      case 'page':
        return context.scope === 'page' && context.activeModals.length === 0;
      case 'global':
        return true;
      default:
        return false;
    }
  }
  
  /**
   * Normalize keyboard combo for cross-platform consistency
   */
  public normalizeCombo(combo: string): string {
    return combo
      .toLowerCase()
      .replace(/\s+/g, '') // Remove spaces
      .replace(/cmd|meta/g, this.platform === 'mac' ? 'cmd' : 'ctrl') // Normalize modifier
      .replace(/option/g, 'alt') // Normalize option key
      .split('+')
      .sort() // Sort modifiers for consistency
      .join('+');
  }
  
  /**
   * Get platform-appropriate display string for combo
   */
  public getDisplayCombo(combo: string): string {
    const parts = combo.toLowerCase().split('+');
    const modifiers = parts.slice(0, -1);
    const key = parts[parts.length - 1];
    
    const displayModifiers = modifiers.map(mod => {
      switch (mod) {
        case 'cmd':
        case 'meta':
          return this.platform === 'mac' ? '⌘' : 'Ctrl';
        case 'ctrl':
          return this.platform === 'mac' ? '⌃' : 'Ctrl';
        case 'alt':
          return this.platform === 'mac' ? '⌥' : 'Alt';
        case 'shift':
          return this.platform === 'mac' ? '⇧' : 'Shift';
        default:
          return mod;
      }
    });
    
    const displayKey = key.length === 1 ? key.toUpperCase() : key;
    
    return [...displayModifiers, displayKey].join(this.platform === 'mac' ? '' : '+');
  }
  
  /**
   * Detect the current platform
   */
  private detectPlatform(): Platform {
    if (typeof window === 'undefined') return 'linux';
    
    const userAgent = window.navigator.userAgent;
    if (userAgent.includes('Mac')) return 'mac';
    if (userAgent.includes('Win')) return 'windows';
    return 'linux';
  }
  
  /**
   * Clear all shortcuts (for testing)
   */
  public clear(): void {
    this.shortcuts.clear();
    this.registrations.clear();
  }
  
  /**
   * Get registration statistics
   */
  public getStats() {
    return {
      totalShortcuts: this.shortcuts.size,
      totalRegistrations: this.registrations.size,
      bySource: Array.from(this.registrations.values()).reduce((acc, reg) => {
        acc[reg.source] = (acc[reg.source] || 0) + reg.shortcuts.length;
        return acc;
      }, {} as Record<string, number>),
      byScope: Array.from(this.shortcuts.values()).reduce((acc, shortcut) => {
        acc[shortcut.scope] = (acc[shortcut.scope] || 0) + 1;
        return acc;
      }, {} as Record<ShortcutScope, number>)
    };
  }
}

// Export singleton instance
export const shortcutsRegistry = new ShortcutsRegistry();

// Core shortcuts that are always available
export const coreShortcuts: Shortcut[] = [
  {
    id: 'escape-close',
    combo: 'escape',
    description: 'Close modal or sheet',
    handler: () => {
      // This will be implemented by the provider
      return false; // Let other handlers run too
    },
    scope: 'global',
    category: 'navigation',
    preventDefault: false,
    stopPropagation: false
  },
  {
    id: 'help-toggle',
    combo: ['cmd+/', 'ctrl+/'],
    description: 'Toggle keyboard shortcuts help',
    handler: () => {
      // This will be implemented by the provider
      console.log('Help shortcuts not yet implemented');
      return true;
    },
    scope: 'global',
    category: 'help'
  }
];

// Register core shortcuts immediately
shortcutsRegistry.register('core', {
  shortcuts: coreShortcuts,
  source: 'core'
});