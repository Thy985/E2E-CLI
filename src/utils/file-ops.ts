/**
 * Shared file operations used by multiple engines (sandbox, fix, etc.)
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Replace all occurrences of a search string or regex pattern in a file.
 *
 * @param filePath - Absolute path to the target file
 * @param search - String or RegExp pattern to find
 * @param replace - Replacement text
 * @throws if the file doesn't exist or the search pattern is not found (string mode)
 */
export async function replaceInFile(
  filePath: string,
  search: string | RegExp,
  replace: string
): Promise<void> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const newContent = content.replace(search, replace);
  if (newContent === content && typeof search === 'string') {
    throw new Error(`Search pattern not found in ${filePath}`);
  }
  await fs.promises.writeFile(filePath, newContent, 'utf-8');
}

/**
 * Insert content at a specific line number in a file.
 *
 * @param filePath - Absolute path to the target file
 * @param line - Line number to insert at (0-based, clamped to valid range)
 * @param content - Content to insert
 * @throws if the file doesn't exist
 */
export async function insertInFile(
  filePath: string,
  line: number,
  content: string
): Promise<void> {
  const existing = fs.readFileSync(filePath, 'utf-8');
  const lines = existing.split('\n');
  const insertAt = Math.max(0, Math.min(line, lines.length));
  lines.splice(insertAt, 0, content);
  await fs.promises.writeFile(filePath, lines.join('\n'), 'utf-8');
}

/**
 * Delete all occurrences of a search string from a file.
 *
 * @param filePath - Absolute path to the target file
 * @param search - String to find and remove
 * @throws if the file doesn't exist or search is empty, or pattern not found
 */
export async function deleteInFile(
  filePath: string,
  search: string
): Promise<void> {
  if (!search) {
    throw new Error('delete requires content to search for');
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  if (!content.includes(search)) {
    throw new Error(`Search pattern not found in ${filePath}`);
  }
  const newContent = content.replaceAll(search, '');
  await fs.promises.writeFile(filePath, newContent, 'utf-8');
}

/**
 * Recursively copy a directory, optionally excluding subdirectories/files by name.
 *
 * @param source - Source directory path
 * @param target - Target directory path (created if not existing)
 * @param exclude - Array of directory/file names to skip
 */
export async function copyDir(
  source: string,
  target: string,
  exclude: string[] = []
): Promise<void> {
  if (!fs.existsSync(source)) {
    throw new Error(`Source directory does not exist: ${source}`);
  }
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }

  const entries = fs.readdirSync(source, { withFileTypes: true });

  for (const entry of entries) {
    if (exclude.includes(entry.name)) continue;

    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      await copyDir(sourcePath, targetPath, exclude);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

/**
 * Recursively remove a directory and all its contents.
 *
 * @param dirPath - Directory path to remove
 */
export async function removeDir(dirPath: string): Promise<void> {
  if (fs.existsSync(dirPath)) {
    await fs.promises.rm(dirPath, { recursive: true, force: true });
  }
}
