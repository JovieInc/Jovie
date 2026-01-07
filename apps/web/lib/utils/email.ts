/**
 * Email utility functions for consistent email handling across the application.
 *
 * This module consolidates email normalization logic that was previously
 * duplicated across multiple files (waitlist route, auth gate, etc.).
 */

/**
 * Normalize email addresses for consistent storage and comparison.
 *
 * Normalization rules:
 * - Trim leading/trailing whitespace
 * - Convert to lowercase
 *
 * This ensures case-insensitive email matching and prevents duplicate
 * entries with different casing (e.g., "Test@Example.com" vs "test@example.com").
 *
 * @param email - Raw email address from user input
 * @returns Normalized email address
 *
 * @example
 * normalizeEmail('  TEST@EXAMPLE.COM  ') // returns 'test@example.com'
 * normalizeEmail('user@Domain.COM') // returns 'user@domain.com'
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
