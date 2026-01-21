/**
 * Host Validation Utilities
 *
 * Validates that URLs belong to expected platforms and hosts.
 */

import type { StrategyConfig } from './types';

/**
 * Validates that a parsed URL's hostname is in the allowed host list.
 *
 * @param hostname - The hostname to check (should be lowercase)
 * @param config - Strategy configuration with valid hosts
 * @returns True if hostname is in the valid hosts set
 */
export function isValidHost(hostname: string, config: StrategyConfig): boolean {
  return config.validHosts.has(hostname.toLowerCase());
}

/**
 * Validates that the canonical host is properly configured.
 * Prevents misconfiguration where canonical host isn't in valid hosts list.
 *
 * @param config - Strategy configuration to validate
 * @returns True if canonical host is in valid hosts set
 */
export function isCanonicalHostValid(config: StrategyConfig): boolean {
  return config.validHosts.has(config.canonicalHost.toLowerCase());
}
