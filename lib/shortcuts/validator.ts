/**
 * Keyboard Shortcuts Validator
 * 
 * Validates shortcuts for conflicts, reserved combinations, and best practices.
 * Enforces consistency and prevents conflicts across the application.
 */

import type { 
  Shortcut, 
  ValidationResult, 
  ShortcutConflict, 
  ShortcutWarning,
  RESERVED_SHORTCUTS,
  ReservedShortcut
} from './types';

/**
 * Validate a set of shortcuts for conflicts and issues
 */
export function validateShortcuts(shortcuts: Shortcut[]): ValidationResult {
  const conflicts: ShortcutConflict[] = [];
  const warnings: ShortcutWarning[] = [];
  
  // Check for reserved shortcuts
  for (const shortcut of shortcuts) {
    const combos = Array.isArray(shortcut.combo) ? shortcut.combo : [shortcut.combo];
    
    for (const combo of combos) {
      const normalizedCombo = normalizeCombo(combo);
      
      // Check against reserved shortcuts
      if (isReservedShortcut(normalizedCombo)) {
        warnings.push({
          type: 'reserved',
          combo: normalizedCombo,
          message: `Combo "${combo}" is reserved by the browser/OS and may not work reliably`
        });
      }
      
      // Check for accessibility issues
      if (isAccessibilityShortcut(normalizedCombo)) {
        warnings.push({
          type: 'accessibility',
          combo: normalizedCombo,
          message: `Combo "${combo}" conflicts with common accessibility shortcuts`
        });
      }
      
      // Check for platform-specific issues
      const platformWarning = getPlatformWarning(normalizedCombo);
      if (platformWarning) {
        warnings.push({
          type: 'platform',
          combo: normalizedCombo,
          message: platformWarning
        });
      }
    }
  }
  
  // Check for conflicts between shortcuts
  const comboMap = new Map<string, Shortcut[]>();
  
  for (const shortcut of shortcuts) {
    const combos = Array.isArray(shortcut.combo) ? shortcut.combo : [shortcut.combo];
    
    for (const combo of combos) {
      const normalizedCombo = normalizeCombo(combo);
      
      if (!comboMap.has(normalizedCombo)) {
        comboMap.set(normalizedCombo, []);
      }
      comboMap.get(normalizedCombo)!.push(shortcut);
    }
  }
  
  // Find conflicts
  for (const [combo, conflictingShortcuts] of comboMap.entries()) {
    if (conflictingShortcuts.length > 1) {
      // Check if conflicts are in different scopes (acceptable)
      const scopes = [...new Set(conflictingShortcuts.map(s => s.scope))];
      const scopeHierarchy = ['modal', 'sheet', 'page', 'global'];
      
      // If all conflicts are in different scope levels, it's acceptable
      const hasConflictInSameScope = scopes.some(scope => {
        const shortcutsInScope = conflictingShortcuts.filter(s => s.scope === scope);
        return shortcutsInScope.length > 1;
      });
      
      if (hasConflictInSameScope) {
        conflicts.push({
          combo,
          shortcuts: conflictingShortcuts.map(s => ({
            id: s.id,
            scope: s.scope,
            category: s.category
          })),
          severity: 'error'
        });
      } else {
        // Different scopes - just a warning
        conflicts.push({
          combo,
          shortcuts: conflictingShortcuts.map(s => ({
            id: s.id,
            scope: s.scope,
            category: s.category
          })),
          severity: 'warning'
        });
      }
    }
  }
  
  return {
    isValid: conflicts.filter(c => c.severity === 'error').length === 0,
    conflicts,
    warnings
  };
}

/**
 * Check if a combo is reserved by browser/OS
 */
function isReservedShortcut(combo: string): boolean {
  const reserved = [
    // Browser navigation
    'cmd+r', 'ctrl+r', // Reload
    'cmd+shift+r', 'ctrl+shift+r', // Hard reload
    'cmd+w', 'ctrl+w', // Close tab
    'cmd+t', 'ctrl+t', // New tab
    'cmd+shift+t', 'ctrl+shift+t', // Reopen tab
    'cmd+n', 'ctrl+n', // New window
    'cmd+shift+n', 'ctrl+shift+n', // New private window
    'cmd+l', 'ctrl+l', // Address bar
    'cmd+d', 'ctrl+d', // Bookmark
    
    // System shortcuts
    'cmd+c', 'ctrl+c', // Copy
    'cmd+v', 'ctrl+v', // Paste
    'cmd+x', 'ctrl+x', // Cut
    'cmd+z', 'ctrl+z', // Undo
    'cmd+shift+z', 'ctrl+shift+z', // Redo
    'cmd+a', 'ctrl+a', // Select all
    'cmd+f', 'ctrl+f', // Find
    'cmd+s', 'ctrl+s', // Save
    'cmd+p', 'ctrl+p', // Print
  ];
  
  return reserved.some(reserved => normalizeCombo(reserved) === combo);
}

/**
 * Check if a combo conflicts with accessibility shortcuts
 */
function isAccessibilityShortcut(combo: string): boolean {
  const accessibilityShortcuts = [
    'tab', 'shift+tab', // Focus navigation
    'enter', 'space', // Activation
    'escape', // Cancel/close
    'home', 'end', // Navigation
    'pageup', 'pagedown', // Navigation
    'f6', // Area navigation
    'alt+tab', // Window switching
    'cmd+tab', // App switching (Mac)
  ];
  
  return accessibilityShortcuts.some(reserved => normalizeCombo(reserved) === combo);
}

/**
 * Get platform-specific warnings
 */
function getPlatformWarning(combo: string): string | null {
  // Check for Mac-specific issues
  if (combo.includes('ctrl') && combo.includes('cmd')) {
    return 'Using both Ctrl and Cmd modifiers may not work as expected';
  }
  
  // Check for Windows-specific issues
  if (combo.includes('alt+f4')) {
    return 'Alt+F4 closes the window on Windows';
  }
  
  return null;
}

/**
 * Normalize combo for consistent comparison
 */
function normalizeCombo(combo: string): string {
  return combo
    .toLowerCase()
    .replace(/\s+/g, '') // Remove spaces
    .replace(/meta/g, 'cmd') // Normalize meta to cmd
    .replace(/option/g, 'alt') // Normalize option to alt
    .split('+')
    .sort() // Sort for consistent comparison
    .join('+');
}

/**
 * Validate a single shortcut
 */
export function validateShortcut(shortcut: Shortcut): ValidationResult {
  return validateShortcuts([shortcut]);
}

/**
 * Check if shortcuts can coexist (different scopes, etc.)
 */
export function canShortcutsCoexist(shortcut1: Shortcut, shortcut2: Shortcut): boolean {
  const combos1 = Array.isArray(shortcut1.combo) ? shortcut1.combo : [shortcut1.combo];
  const combos2 = Array.isArray(shortcut2.combo) ? shortcut2.combo : [shortcut2.combo];
  
  // Check if they share any combos
  const sharedCombos = combos1.some(c1 => 
    combos2.some(c2 => normalizeCombo(c1) === normalizeCombo(c2))
  );
  
  if (!sharedCombos) return true;
  
  // If they share combos, check if they're in different scopes
  const scopeHierarchy = ['modal', 'sheet', 'page', 'global'];
  const scope1Index = scopeHierarchy.indexOf(shortcut1.scope);
  const scope2Index = scopeHierarchy.indexOf(shortcut2.scope);
  
  // They can coexist if they're in different scope levels
  return scope1Index !== scope2Index;
}

/**
 * Development-only validator that runs in CI/dev environments
 */
export function validateAllShortcuts(shortcutsMap: Map<string, Shortcut>): void {
  if (process.env.NODE_ENV === 'production') return;
  
  const shortcuts = Array.from(shortcutsMap.values());
  const validation = validateShortcuts(shortcuts);
  
  if (!validation.isValid) {
    const errorMessage = validation.conflicts
      .filter(c => c.severity === 'error')
      .map(c => `Conflict in combo "${c.combo}": ${c.shortcuts.map(s => s.id).join(', ')}`)
      .join('\n');
    
    throw new Error(`Keyboard shortcut validation failed:\n${errorMessage}`);
  }
  
  if (validation.warnings.length > 0) {
    console.warn('Keyboard shortcut warnings:');
    validation.warnings.forEach(w => {
      console.warn(`  ${w.type}: ${w.combo} - ${w.message}`);
    });
  }
}