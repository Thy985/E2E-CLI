/**
 * ID and hash utilities
 */

import { createHash, randomUUID } from 'crypto';

/**
 * Generate an 8-character unique ID
 */
export function generateId(): string {
  return randomUUID().slice(0, 8);
}

/**
 * Short content hash (8 hex chars, MD5-based)
 */
export function hash(content: string): string {
  return createHash('md5').update(content).digest('hex').slice(0, 8);
}
