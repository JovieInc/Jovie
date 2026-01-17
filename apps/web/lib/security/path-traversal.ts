/**
 * Path Traversal Protection Utilities
 *
 * Prevents path traversal attacks when working with file system operations.
 * Use these utilities to validate file paths before reading/writing files.
 */

import path from 'path';

const CONTROL_CHARACTER_REGEX = /[\x00-\x1F\x80-\x9F]/g;

/**
 * Validates that a file path is within an allowed base directory.
 * Prevents path traversal attacks like "../../../etc/passwd".
 *
 * @param filePath - The file path to validate
 * @param baseDirectory - The base directory that files must be within
 * @returns The resolved safe path
 * @throws Error if the path attempts to escape the base directory
 *
 * @example
 * const safePath = validatePathTraversal('blog/post.md', BLOG_DIRECTORY);
 * const content = await fs.readFile(safePath, 'utf-8');
 */
export function validatePathTraversal(
  filePath: string,
  baseDirectory: string
): string {
  // Resolve both paths to absolute paths
  const resolvedBase = path.resolve(baseDirectory);
  const resolvedPath = path.resolve(baseDirectory, filePath);

  // Check if the resolved path starts with the base directory
  if (!resolvedPath.startsWith(resolvedBase + path.sep)) {
    throw new Error(
      `[PATH_TRAVERSAL_DETECTED] Attempted path traversal: ${filePath}`
    );
  }

  return resolvedPath;
}

/**
 * Validates a filename to ensure it doesn't contain path traversal characters.
 * Prevents attacks like "../../etc/passwd" or "..\\..\\windows\\system32".
 *
 * @param filename - The filename to validate
 * @returns True if the filename is safe
 *
 * @example
 * if (!isValidFilename(userInput)) {
 *   throw new Error('Invalid filename');
 * }
 */
export function isValidFilename(filename: string): boolean {
  // Disallow path separators and parent directory references
  const dangerousPatterns = /[\/\\]|\.\.|\0/;
  return !dangerousPatterns.test(filename);
}

/**
 * Sanitizes a filename by removing or replacing dangerous characters.
 * Use this when you need to create filenames from user input.
 *
 * @param filename - The filename to sanitize
 * @returns Sanitized filename safe for file system operations
 *
 * @example
 * const safeFilename = sanitizeFilename(userInput);
 * const filePath = path.join(UPLOAD_DIR, safeFilename);
 */
export function sanitizeFilename(filename: string): string {
  return (
    filename
      // Remove path separators
      .replace(/[\/\\]/g, '')
      // Remove parent directory references
      .replace(/\.\./g, '')
      // Remove null bytes
      .replace(/\0/g, '')
      // Remove control characters
      .replace(CONTROL_CHARACTER_REGEX, '')
      // Remove other potentially dangerous characters
      .replace(/[<>:"|?*]/g, '')
      // Trim whitespace
      .trim()
      // Limit length
      .slice(0, 255)
  );
}

/**
 * Creates a safe path by joining a base directory with a user-provided path segment.
 * Validates against path traversal and returns the safe absolute path.
 *
 * @param baseDirectory - The base directory
 * @param userPath - The user-provided path segment
 * @returns Safe absolute path within the base directory
 * @throws Error if path traversal is detected
 *
 * @example
 * const safePath = createSafePath(BLOG_DIRECTORY, userProvidedSlug);
 * const content = await fs.readFile(safePath, 'utf-8');
 */
export function createSafePath(
  baseDirectory: string,
  userPath: string
): string {
  // First sanitize the user input
  const sanitizedPath = userPath
    .split(path.sep)
    .map(segment => sanitizeFilename(segment))
    .join(path.sep);

  // Then validate it doesn't escape the base directory
  return validatePathTraversal(sanitizedPath, baseDirectory);
}
