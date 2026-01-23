/**
 * @fileoverview Canonical Platform Registry - Single Source of Truth
 *
 * This module is the **SINGLE SOURCE OF TRUTH** for all social platform definitions
 * in the Jovie application. It consolidates platform definitions that were previously
 * scattered across multiple files into one authoritative location.
 *
 * This file is a barrel export that re-exports from the modular
 * platforms directory for backwards compatibility.
 *
 * @module constants/platforms
 * @see {@link https://simpleicons.org/} for icon slugs
 */

// Re-export everything from the modular platforms directory
export * from './platforms/index';
